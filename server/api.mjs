import { randomUUID, createHash } from 'node:crypto';
import { audit, hashPassword, verifyPassword } from './db.mjs';
import { analyze, fields } from './analysis.mjs';
import { detectMime, extractDocument } from './documents.mjs';
import { findMunicipalities, municipalityBounds } from './maps.mjs';

const err = (status, message) => Object.assign(new Error(message), { status });
const clean = (v, max = 200) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const must = (v, message) => {
  if (!v) throw err(400, message);
};
const one = async (c, sql, args, message = 'Registro não encontrado') => {
  const r = await c.query(sql, args);
  if (!r.rows[0]) throw err(404, message);
  return r.rows[0];
};
export const send = (res, status, value) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
};
async function body(req, max = 1024 * 1024) {
  if (Number(req.headers['content-length']) > max)
    throw err(413, 'Arquivo ou requisição acima do limite.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw err(413, 'Arquivo ou requisição acima do limite.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(req) {
  must(
    (req.headers['content-type'] || '').includes('application/json'),
    'Envie JSON.',
  );
  try {
    const value = JSON.parse((await body(req)).toString());
    must(
      value && typeof value === 'object' && !Array.isArray(value),
      'Envie um objeto JSON.',
    );
    return value;
  } catch (e) {
    if (e.status) throw e;
    throw err(400, 'JSON inválido.');
  }
}
const touch = async (c, id) =>
  c.query(
    "UPDATE requests SET revision=revision+1,status='rascunho',updated_at=now() WHERE id=$1",
    [id],
  );
function number(
  v,
  label,
  { min = 0, max = 1e12, integer = false, nullable = true } = {},
) {
  if (v == null || v === '') {
    if (nullable) return null;
    throw err(400, label + ' obrigatório.');
  }
  must(
    typeof v === 'number' &&
      Number.isFinite(v) &&
      v >= min &&
      v <= max &&
      (!integer || Number.isInteger(v)),
    label + ' inválido.',
  );
  return v;
}
export function validateData(input) {
  must(
    input && typeof input === 'object' && !Array.isArray(input),
    'Dados financeiros inválidos.',
  );
  const d = {};
  for (const k of Object.keys(fields))
    d[k] = number(
      input[k],
      fields[k],
      k === 'termMonths'
        ? { min: 1, max: 360, integer: true }
        : k === 'principal'
          ? { min: 0.01 }
          : k === 'monthlyRate'
            ? { max: 20 }
            : k === 'stressRevenuePct'
              ? { max: 100 }
              : k === 'stressCostPct'
                ? { max: 300 }
                : {},
    );
  for (const k of [
    'purpose',
    'periodStart',
    'history',
    'soil',
    'climate',
    'notes',
  ])
    d[k] = clean(input[k], k === 'periodStart' ? 10 : 5000);
  if (d.periodStart)
    must(
      /^\d{4}-\d{2}-\d{2}$/.test(d.periodStart) &&
        !Number.isNaN(Date.parse(d.periodStart)) &&
        new Date(d.periodStart).toISOString().slice(0, 10) === d.periodStart,
      'Data inicial inválida.',
    );
  d.sources = {};
  for (const k of Object.keys(fields))
    if (input.sources?.[k]) d.sources[k] = clean(input.sources[k], 500);
  return d;
}
export function validDocument(value) {
  if (!value) return true;
  if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const size = value.length === 11 ? 9 : 12;
  const calc = (s) => {
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
      const w = size === 9 ? s.length + 1 - i : ((s.length - 1 - i) % 8) + 2;
      sum += Number(s[i]) * w;
    }
    const n = 11 - (sum % 11);
    return n >= 10 ? 0 : n;
  };
  return (
    calc(value.slice(0, size)) === Number(value[size]) &&
    calc(value.slice(0, size + 1)) === Number(value[size + 1])
  );
}
export function createApi(db) {
  const failures = new Map();
  async function authenticate(req) {
    const ip = req.socket.remoteAddress;
    let limit = failures.get(ip);
    if (limit && limit.until < Date.now()) {
      failures.delete(ip);
      limit = null;
    }
    if (limit?.count >= 30)
      throw err(429, 'Muitas tentativas. Aguarde 10 minutos.');
    const header = req.headers.authorization || '';
    let user;
    if (header.startsWith('Basic ')) {
      const text = Buffer.from(header.slice(6), 'base64').toString();
      const at = text.indexOf(':');
      if (at > 0 && text.length < 1000) {
        const r = await db.query(
          'SELECT * FROM users WHERE username=$1 AND active=true',
          [text.slice(0, at)],
        );
        if (
          r.rows[0] &&
          verifyPassword(text.slice(at + 1), r.rows[0].password_hash)
        )
          user = r.rows[0];
      }
    }
    if (!user) {
      if (header)
        failures.set(ip, {
          count: (limit?.count || 0) + 1,
          until: Date.now() + 600000,
        });
      if (failures.size > 5000) failures.delete(failures.keys().next().value);
      return null;
    }
    failures.delete(ip);
    delete user.password_hash;
    return user;
  }
  const writable = (u) => {
    if (!['admin', 'analyst'].includes(u.role))
      throw err(403, 'Seu perfil permite apenas consulta.');
  };
  const admin = (u) => {
    if (u.role !== 'admin') throw err(403, 'Ação exclusiva do administrador.');
  };
  async function handle(req, res, user) {
    const u = new URL(req.url, 'http://local'),
      path = u.pathname,
      method = req.method;
    if (!['GET', 'HEAD'].includes(method)) {
      must(
        req.headers['x-credit-request'] === '1',
        'Requisição não autorizada.',
      );
      if (req.headers.origin) {
        const expected =
          process.env.APP_ORIGIN ||
          `https://${process.env.RAILWAY_PUBLIC_DOMAIN || req.headers.host}`;
        if (req.headers.origin !== expected)
          throw err(403, 'Origem não autorizada.');
      }
      if (path !== '/api/password') writable(user);
    }
    if (path === '/api/me' && method === 'GET') return send(res, 200, user);
    if (path === '/api/maps/municipalities' && method === 'GET')
      return send(
        res,
        200,
        await findMunicipalities(u.searchParams.get('name') || ''),
      );
    const municipalMatch = path.match(/^\/api\/maps\/municipalities\/(\d{7})$/);
    if (municipalMatch && method === 'GET')
      return send(res, 200, await municipalityBounds(municipalMatch[1]));
    const overviewMatch = path.match(/^\/api\/producers\/([^/]+)\/overview$/);
    if (overviewMatch && method === 'GET') {
      const id = overviewMatch[1];
      const result = await db.tx(async (c) => {
        await c.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        const producer = await one(c, 'SELECT * FROM producers WHERE id=$1', [
          id,
        ]);
        const properties = (
          await c.query(
            'SELECT * FROM properties WHERE producer_id=$1 ORDER BY name,id',
            [id],
          )
        ).rows;
        const requests = (
          await c.query(
            'SELECT r.*,u.name AS consultant_name FROM requests r LEFT JOIN users u ON u.id=r.created_by WHERE r.producer_id=$1 ORDER BY r.updated_at DESC,r.id',
            [id],
          )
        ).rows;
        const documents = (
          await c.query(
            `SELECT d.id,d.request_id,d.name,d.mime,d.sha256,d.status,d.error,d.review_note,d.reviewed_fields,d.reviewed_at,d.created_at,u.name AS reviewer_name,r.title AS request_title
          FROM documents d JOIN requests r ON r.id=d.request_id LEFT JOIN users u ON u.id=d.reviewed_by
          WHERE r.producer_id=$1 ORDER BY d.created_at DESC,d.id`,
            [id],
          )
        ).rows;
        const analyses = (
          await c.query(
            `SELECT DISTINCT ON (a.request_id) a.id,a.request_id,a.source_revision,a.result,a.created_at,u.name AS actor_name
          FROM analyses a JOIN requests r ON r.id=a.request_id LEFT JOIN users u ON u.id=a.created_by
          WHERE r.producer_id=$1 ORDER BY a.request_id,a.created_at DESC,a.id`,
            [id],
          )
        ).rows;
        const decisions = (
          await c.query(
            `SELECT d.*,u.name AS actor_name,r.title AS request_title FROM decisions d JOIN requests r ON r.id=d.request_id LEFT JOIN users u ON u.id=d.created_by WHERE r.producer_id=$1 ORDER BY d.created_at DESC,d.id`,
            [id],
          )
        ).rows;
        const history = (
          await c.query(
            `SELECT a.*,u.name AS actor_name,COUNT(*) OVER() AS total_events FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE
          (a.entity_type='producer' AND a.entity_id=$1) OR
          (a.entity_type='property' AND a.entity_id IN (SELECT id FROM properties WHERE producer_id=$1)) OR
          (a.entity_type='request' AND a.entity_id IN (SELECT id FROM requests WHERE producer_id=$1)) OR
          (a.entity_type='document' AND a.entity_id IN (SELECT d.id FROM documents d JOIN requests r ON r.id=d.request_id WHERE r.producer_id=$1))
          ORDER BY a.id DESC LIMIT 200`,
            [id],
          )
        ).rows;
        return {
          producer,
          properties,
          requests,
          documents,
          analyses,
          decisions,
          history,
          generated_at: new Date().toISOString(),
        };
      });
      return send(res, 200, result);
    }
    if (path === '/api/state' && method === 'GET') {
      const result = await Promise.all([
        db.query('SELECT * FROM producers ORDER BY name LIMIT 2000'),
        db.query('SELECT * FROM properties ORDER BY name LIMIT 2000'),
        db.query(
          'SELECT r.*,p.name AS producer_name FROM requests r JOIN producers p ON p.id=r.producer_id ORDER BY r.updated_at DESC LIMIT 1000',
        ),
      ]);
      return send(res, 200, {
        producers: result[0].rows,
        properties: result[1].rows,
        requests: result[2].rows,
      });
    }
    if (path === '/api/users' && method === 'GET') {
      admin(user);
      return send(
        res,
        200,
        (
          await db.query(
            'SELECT id,username,name,role,active,created_at FROM users ORDER BY name',
          )
        ).rows,
      );
    }
    if (path === '/api/users' && method === 'POST') {
      admin(user);
      const b = await json(req);
      must(
        /^[a-zA-Z0-9._-]{3,50}$/.test(b.username || ''),
        'Usuário deve ter 3 a 50 letras, números, pontos ou traços.',
      );
      must(
        typeof b.password === 'string' &&
          b.password.length >= 12 &&
          b.password.length <= 200,
        'Senha deve ter entre 12 e 200 caracteres.',
      );
      must(['admin', 'analyst', 'viewer'].includes(b.role), 'Perfil inválido.');
      const id = randomUUID();
      await db.tx(async (c) => {
        await c.query(
          'INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
          [
            id,
            b.username,
            clean(b.name) || b.username,
            hashPassword(b.password),
            b.role,
          ],
        );
        await audit(c, user, 'create', 'user', id, {
          username: b.username,
          role: b.role,
        });
      });
      return send(res, 201, { id });
    }
    if (path === '/api/password' && method === 'POST') {
      const b = await json(req);
      must(
        typeof b.password === 'string' &&
          b.password.length >= 12 &&
          b.password.length <= 200,
        'Senha deve ter entre 12 e 200 caracteres.',
      );
      await db.tx(async (c) => {
        await c.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
          hashPassword(b.password),
          user.id,
        ]);
        await audit(c, user, 'password_changed', 'user', user.id);
      });
      return send(res, 200, { ok: true });
    }
    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && method === 'PUT') {
      admin(user);
      const b = await json(req);
      must(typeof b.active === 'boolean', 'Informe o estado do acesso.');
      must(
        userMatch[1] !== user.id,
        'Não é possível desativar seu próprio acesso.',
      );
      await db.tx(async (c) => {
        await one(c, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          userMatch[1],
        ]);
        await c.query('UPDATE users SET active=$2 WHERE id=$1', [
          userMatch[1],
          b.active,
        ]);
        await audit(c, user, 'access_changed', 'user', userMatch[1], {
          active: b.active,
        });
      });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/audit' && method === 'GET') {
      admin(user);
      return send(
        res,
        200,
        (
          await db.query(
            'SELECT a.*,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 300',
          )
        ).rows,
      );
    }
    const producerMatch = path.match(/^\/api\/producers(?:\/([^/]+))?$/);
    if (producerMatch && ['POST', 'PUT'].includes(method)) {
      must(
        method === 'POST' ? !producerMatch[1] : !!producerMatch[1],
        'Use POST no cadastro novo e PUT no registro existente.',
      );
      const b = await json(req),
        id = producerMatch[1] || randomUUID();
      must(clean(b.name), 'Nome obrigatório.');
      const document = clean(b.document).replace(/\D/g, '') || null;
      must(
        validDocument(document),
        'CPF/CNPJ inválido. Deixe vazio se não disponível.',
      );
      await db.tx(async (c) => {
        if (method === 'PUT')
          await one(c, 'SELECT id FROM producers WHERE id=$1 FOR UPDATE', [id]);
        await c.query(
          'INSERT INTO producers(id,name,document,phone,municipality,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=$2,document=$3,phone=$4,municipality=$5,notes=$6,updated_at=now()',
          [
            id,
            clean(b.name),
            document,
            clean(b.phone, 40),
            clean(b.municipality),
            clean(b.notes, 5000),
            user.id,
          ],
        );
        if (method === 'PUT')
          await c.query(
            "UPDATE requests SET revision=revision+1,status='rascunho',updated_at=now() WHERE producer_id=$1",
            [id],
          );
        await audit(
          c,
          user,
          method === 'POST' ? 'create' : 'update',
          'producer',
          id,
          { name: clean(b.name) },
        );
      });
      return send(res, 200, { id });
    }
    const locationMatch = path.match(/^\/api\/properties\/([^/]+)\/location$/);
    if (locationMatch && method === 'PATCH') {
      const b = await json(req),
        id = locationMatch[1];
      const lat = number(b.latitude, 'Latitude', {
        min: -90,
        max: 90,
        nullable: false,
      });
      const lon = number(b.longitude, 'Longitude', {
        min: -180,
        max: 180,
        nullable: false,
      });
      must(
        Object.hasOwn(b, 'expected_latitude') &&
          Object.hasOwn(b, 'expected_longitude'),
        'Atualize a propriedade antes de salvar a localização.',
      );
      const expectedLat = number(b.expected_latitude, 'Latitude anterior', {
        min: -90,
        max: 90,
      });
      const expectedLon = number(b.expected_longitude, 'Longitude anterior', {
        min: -180,
        max: 180,
      });
      await db.tx(async (c) => {
        const old = await one(
          c,
          'SELECT * FROM properties WHERE id=$1 FOR UPDATE',
          [id],
        );
        const previous = {
          latitude: old.latitude == null ? null : Number(old.latitude),
          longitude: old.longitude == null ? null : Number(old.longitude),
        };
        if (
          previous.latitude !== expectedLat ||
          previous.longitude !== expectedLon
        )
          throw err(
            409,
            'A localização foi alterada por outro usuário. Atualize a página antes de salvar.',
          );
        await c.query(
          'UPDATE properties SET latitude=$2,longitude=$3,updated_at=now() WHERE id=$1',
          [id, lat, lon],
        );
        await c.query(
          "UPDATE requests SET revision=revision+1,status='rascunho',updated_at=now() WHERE property_ids @> $1::jsonb",
          [JSON.stringify([id])],
        );
        await audit(c, user, 'location_updated', 'property', id, {
          name: old.name,
          before: previous,
          after: { latitude: lat, longitude: lon },
        });
      });
      return send(res, 200, { id });
    }
    const propMatch = path.match(/^\/api\/properties(?:\/([^/]+))?$/);
    if (propMatch && ['POST', 'PUT'].includes(method)) {
      must(
        method === 'POST' ? !propMatch[1] : !!propMatch[1],
        'Use POST no cadastro novo e PUT no registro existente.',
      );
      const b = await json(req),
        id = propMatch[1] || randomUUID();
      must(clean(b.name) && clean(b.municipality), 'Informe nome e município.');
      const area = number(b.area_ha, 'Área', {
        min: 0.001,
        max: 1e7,
        nullable: false,
      });
      must(
        ['Própria', 'Arrendada', 'Parceria', 'Outra'].includes(b.tenure),
        'Posse inválida.',
      );
      const lat = number(b.latitude, 'Latitude', { min: -90, max: 90 }),
        lng = number(b.longitude, 'Longitude', { min: -180, max: 180 });
      must(
        (lat === null) === (lng === null),
        'Informe latitude e longitude juntas.',
      );
      await db.tx(async (c) => {
        await one(c, 'SELECT id FROM producers WHERE id=$1', [b.producer_id]);
        if (method === 'PUT') {
          const old = await one(
            c,
            'SELECT * FROM properties WHERE id=$1 FOR UPDATE',
            [id],
          );
          must(
            old.producer_id === b.producer_id,
            'Não é possível trocar o produtor de uma propriedade.',
          );
        }
        await c.query(
          'INSERT INTO properties(id,producer_id,name,municipality,area_ha,tenure,car,registry,latitude,longitude,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET name=$3,municipality=$4,area_ha=$5,tenure=$6,car=$7,registry=$8,latitude=$9,longitude=$10,notes=$11,updated_at=now()',
          [
            id,
            b.producer_id,
            clean(b.name),
            clean(b.municipality),
            area,
            b.tenure,
            clean(b.car),
            clean(b.registry),
            lat,
            lng,
            clean(b.notes, 5000),
          ],
        );
        if (method === 'PUT')
          await c.query(
            "UPDATE requests SET revision=revision+1,status='rascunho',updated_at=now() WHERE property_ids @> $1::jsonb",
            [JSON.stringify([id])],
          );
        await audit(
          c,
          user,
          method === 'POST' ? 'create' : 'update',
          'property',
          id,
          { area_ha: area, name: clean(b.name) },
        );
      });
      return send(res, 200, { id });
    }
    const requestMatch = path.match(/^\/api\/requests(?:\/([^/]+))?$/);
    if (requestMatch && ['POST', 'PUT'].includes(method)) {
      must(
        method === 'POST' ? !requestMatch[1] : !!requestMatch[1],
        'Use POST no cadastro novo e PUT no registro existente.',
      );
      const b = await json(req),
        id = requestMatch[1] || randomUUID();
      must(clean(b.title), 'Título obrigatório.');
      const data = validateData(b.data || {});
      must(
        Array.isArray(b.property_ids) && b.property_ids.length <= 100,
        'Selecione as propriedades.',
      );
      const ids = [...new Set(b.property_ids)];
      await db.tx(async (c) => {
        await one(c, 'SELECT id FROM producers WHERE id=$1', [b.producer_id]);
        for (const pid of ids)
          await one(
            c,
            'SELECT id FROM properties WHERE id=$1 AND producer_id=$2',
            [pid, b.producer_id],
            'Propriedade não pertence ao produtor.',
          );
        if (method === 'PUT') {
          const old = await one(
            c,
            'SELECT * FROM requests WHERE id=$1 FOR UPDATE',
            [id],
          );
          must(
            old.producer_id === b.producer_id,
            'Não é possível trocar o produtor de uma solicitação.',
          );
          if (old.revision !== b.revision)
            throw err(
              409,
              'Solicitação alterada por outro usuário. Reabra antes de salvar.',
            );
          await c.query(
            "UPDATE requests SET title=$2,property_ids=$3,data=$4,revision=revision+1,status='rascunho',updated_at=now() WHERE id=$1",
            [id, clean(b.title), JSON.stringify(ids), JSON.stringify(data)],
          );
        } else
          await c.query(
            'INSERT INTO requests(id,producer_id,title,property_ids,data,created_by) VALUES($1,$2,$3,$4,$5,$6)',
            [
              id,
              b.producer_id,
              clean(b.title),
              JSON.stringify(ids),
              JSON.stringify(data),
              user.id,
            ],
          );
        await audit(
          c,
          user,
          method === 'POST' ? 'create' : 'update',
          'request',
          id,
          { data, property_ids: ids },
        );
      });
      return send(res, 200, { id });
    }
    if (requestMatch?.[1] && method === 'GET') {
      const id = requestMatch[1],
        request = await one(
          db,
          'SELECT r.*,p.name AS producer_name FROM requests r JOIN producers p ON p.id=r.producer_id WHERE r.id=$1',
          [id],
        );
      const [docs, analyses, decisions, events] = await Promise.all([
        db.query(
          'SELECT id,name,mime,sha256,status,extracted_text,suggestions,reviewed_fields,review_note,reviewed_at,error,created_at FROM documents WHERE request_id=$1 ORDER BY created_at',
          [id],
        ),
        db.query(
          'SELECT * FROM analyses WHERE request_id=$1 ORDER BY created_at DESC',
          [id],
        ),
        db.query(
          'SELECT d.*,u.name AS actor_name FROM decisions d JOIN users u ON u.id=d.created_by WHERE request_id=$1 ORDER BY created_at DESC',
          [id],
        ),
        db.query(
          'SELECT a.*,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE entity_id=$1 OR entity_id IN (SELECT id FROM documents WHERE request_id=$1) ORDER BY a.id DESC LIMIT 100',
          [id],
        ),
      ]);
      return send(res, 200, {
        request,
        documents: docs.rows,
        analyses: analyses.rows,
        decisions: decisions.rows,
        audit: events.rows,
      });
    }
    const upload = path.match(/^\/api\/requests\/([^/]+)\/documents$/);
    if (upload && method === 'POST') {
      const id = upload[1];
      await one(db, 'SELECT id FROM requests WHERE id=$1', [id]);
      const content = await body(req, 10 * 1024 * 1024);
      must(content.length > 0, 'Arquivo vazio.');
      const mime = detectMime(content);
      must(mime, 'Envie PDF, PNG, JPEG ou TXT UTF-8.');
      let name;
      try {
        name = decodeURIComponent(req.headers['x-file-name'] || 'documento');
      } catch {
        throw err(400, 'Nome inválido.');
      }
      name = clean(name.replace(/[\x00-\x1f/\\]/g, '_'), 160);
      const docId = randomUUID(),
        sha = createHash('sha256').update(content).digest('hex');
      await db.tx(async (c) => {
        await c.query(
          'INSERT INTO documents(id,request_id,name,mime,sha256,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [docId, id, name, mime, sha, content, user.id],
        );
        await touch(c, id);
        await audit(c, user, 'upload', 'document', docId, {
          request_id: id,
          name,
          sha256: sha,
          bytes: content.length,
        });
      });
      return send(res, 201, { id: docId, status: 'pending' });
    }
    const download = path.match(/^\/api\/documents\/([^/]+)\/download$/);
    if (download && method === 'GET') {
      const d = await one(
        db,
        'SELECT name,mime,content FROM documents WHERE id=$1',
        [download[1]],
      );
      res.writeHead(200, {
        'Content-Type': d.mime,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(Buffer.from(d.content));
    }
    const review = path.match(/^\/api\/documents\/([^/]+)\/review$/);
    if (review && method === 'POST') {
      const b = await json(req);
      must(
        clean(b.note, 2000).length >= 10,
        'Descreva a conferência (mínimo 10 caracteres).',
      );
      const confirmed = {};
      for (const k of Object.keys(fields))
        if (b.fields?.[k] != null) confirmed[k] = b.fields[k];
      const checked = validateData(confirmed);
      for (const k of Object.keys(confirmed)) confirmed[k] = checked[k];
      await db.tx(async (c) => {
        const d = await one(
          c,
          'SELECT * FROM documents WHERE id=$1 FOR UPDATE',
          [review[1]],
        );
        if (!['extracted', 'reviewed', 'failed'].includes(d.status))
          throw err(409, 'Aguarde o fim da leitura.');
        await c.query(
          "UPDATE documents SET status='reviewed',reviewed_fields=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1",
          [d.id, JSON.stringify(confirmed), clean(b.note, 2000), user.id],
        );
        await touch(c, d.request_id);
        await audit(c, user, 'review', 'document', d.id, {
          fields: confirmed,
          note: clean(b.note, 2000),
        });
      });
      return send(res, 200, { ok: true });
    }
    const apply = path.match(/^\/api\/documents\/([^/]+)\/apply$/);
    if (apply && method === 'POST') {
      const b = await json(req);
      must(
        Array.isArray(b.keys) && b.keys.length > 0,
        'Selecione campos confirmados.',
      );
      await db.tx(async (c) => {
        const d = await one(
          c,
          'SELECT * FROM documents WHERE id=$1 FOR UPDATE',
          [apply[1]],
        );
        must(d.status === 'reviewed', 'Documento ainda não conferido.');
        const r = await one(
          c,
          'SELECT * FROM requests WHERE id=$1 FOR UPDATE',
          [d.request_id],
        );
        if (r.revision !== b.revision)
          throw err(409, 'Solicitação alterada. Atualize antes de importar.');
        const data = r.data;
        data.sources ??= {};
        for (const k of b.keys) {
          must(
            Object.hasOwn(fields, k) && d.reviewed_fields[k] != null,
            'Campo sem confirmação.',
          );
          data[k] = d.reviewed_fields[k];
          data.sources[k] =
            `Documento ${d.name} (${d.id}), conferido em ${new Date(d.reviewed_at).toISOString()}`;
        }
        await c.query('UPDATE requests SET data=$2 WHERE id=$1', [
          r.id,
          JSON.stringify(validateData(data)),
        ]);
        await touch(c, r.id);
        await audit(c, user, 'apply_fields', 'request', r.id, {
          document_id: d.id,
          keys: b.keys,
        });
      });
      return send(res, 200, { ok: true });
    }
    const analysis = path.match(/^\/api\/requests\/([^/]+)\/analyze$/);
    if (analysis && method === 'POST') {
      const id = analysis[1];
      let output;
      await db.tx(async (c) => {
        const r = await one(
          c,
          'SELECT * FROM requests WHERE id=$1 FOR UPDATE',
          [id],
        );
        const docs = (
          await c.query(
            'SELECT id,name,status,sha256,reviewed_fields,reviewed_at FROM documents WHERE request_id=$1',
            [id],
          )
        ).rows;
        const result = analyze(r.data, docs);
        if (!r.property_ids.length)
          result.warnings.push('Nenhuma propriedade vinculada.');
        if (!r.data.periodStart)
          result.missing.push('Início do período de 12 meses');
        if (!r.data.periodStart) result.status = 'incomplete';
        const aid = randomUUID();
        const producer = await one(c, 'SELECT * FROM producers WHERE id=$1', [
          r.producer_id,
        ]);
        const props = (
          await c.query('SELECT * FROM properties WHERE producer_id=$1', [
            r.producer_id,
          ])
        ).rows.filter((p) => r.property_ids.includes(p.id));
        await c.query(
          'INSERT INTO analyses(id,request_id,source_revision,result,snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6)',
          [
            aid,
            id,
            r.revision,
            JSON.stringify(result),
            JSON.stringify({
              request: r,
              producer,
              properties: props,
              documents: docs,
            }),
            user.id,
          ],
        );
        await c.query(
          'UPDATE requests SET status=$2,updated_at=now() WHERE id=$1',
          [
            id,
            result.status === 'incomplete' ? 'dados_incompletos' : 'analisada',
          ],
        );
        await audit(c, user, 'analyze', 'request', id, {
          analysis_id: aid,
          model: result.model,
          revision: r.revision,
        });
        output = { id: aid, result };
      });
      return send(res, 201, output);
    }
    const decision = path.match(/^\/api\/requests\/([^/]+)\/decision$/);
    if (decision && method === 'POST') {
      admin(user);
      const b = await json(req);
      must(
        ['favoravel', 'desfavoravel', 'complementacao'].includes(b.decision),
        'Decisão inválida.',
      );
      must(
        clean(b.justification, 5000).length >= 30,
        'Justificativa deve ter pelo menos 30 caracteres.',
      );
      const id = decision[1];
      await db.tx(async (c) => {
        const r = await one(
          c,
          'SELECT * FROM requests WHERE id=$1 FOR UPDATE',
          [id],
        );
        const a = await one(
          c,
          'SELECT * FROM analyses WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1',
          [id],
          'Execute a análise antes da decisão.',
        );
        if (a.id !== b.analysis_id || a.source_revision !== r.revision)
          throw err(409, 'Análise desatualizada. Calcule novamente.');
        if (b.decision === 'favoravel') {
          must(
            a.result.status === 'calculated' && r.property_ids.length,
            'Complete a análise e vincule uma propriedade.',
          );
          const docs = (
            await c.query('SELECT status FROM documents WHERE request_id=$1', [
              id,
            ])
          ).rows;
          must(
            docs.length > 0 && docs.every((d) => d.status === 'reviewed'),
            'Confira todos os documentos antes de um parecer favorável.',
          );
          must(
            a.result.warnings.every(
              (w) => !w.startsWith('Fonte não informada:'),
            ),
            'Informe a fonte dos dados financeiros.',
          );
        }
        const did = randomUUID();
        await c.query(
          'INSERT INTO decisions(id,request_id,analysis_id,decision,justification,created_by) VALUES($1,$2,$3,$4,$5,$6)',
          [did, id, a.id, b.decision, clean(b.justification, 5000), user.id],
        );
        await c.query(
          'UPDATE requests SET status=$2,updated_at=now() WHERE id=$1',
          [
            id,
            b.decision === 'complementacao'
              ? 'complementacao'
              : 'parecer_registrado',
          ],
        );
        await audit(c, user, 'decision', 'request', id, {
          decision: b.decision,
          justification: clean(b.justification, 5000),
          analysis_id: a.id,
        });
      });
      return send(res, 200, { ok: true });
    }
    throw err(404, 'Endpoint não encontrado.');
  }
  return { authenticate, handle };
}
export function startDocumentWorker(db) {
  let busy = false,
    stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    let d;
    try {
      await db.query(
        "UPDATE documents SET status='failed',error='A leitura foi interrompida repetidamente. Confira o original manualmente.' WHERE status='processing' AND lease_at < now()-interval '15 minutes' AND attempts>=3",
      );
      d = await db.tx(async (c) => {
        const r = await c.query(
          "SELECT * FROM documents WHERE (status='pending' OR (status='processing' AND lease_at < now()-interval '15 minutes')) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        );
        if (!r.rows[0]) return null;
        await c.query(
          "UPDATE documents SET status='processing',attempts=attempts+1,lease_at=now() WHERE id=$1",
          [r.rows[0].id],
        );
        return r.rows[0];
      });
      if (!d) return;
      const out = await extractDocument(d.content, d.mime);
      await db.tx(async (c) => {
        await c.query(
          "UPDATE documents SET status='extracted',extracted_text=$2,suggestions=$3,error=NULL WHERE id=$1",
          [d.id, out.text, JSON.stringify(out.suggestions)],
        );
        await audit(c, { id: d.created_by }, 'extract', 'document', d.id, {
          method: out.method,
          pages: out.pages,
        });
      });
    } catch (e) {
      if (d)
        await db
          .query("UPDATE documents SET status='failed',error=$2 WHERE id=$1", [
            d.id,
            e.cmd
              ? 'O arquivo não pôde ser lido automaticamente. Envie PDF sem senha ou imagem legível, ou confira o original manualmente.'
              : clean(e.message, 1000),
          ])
          .catch(() => {});
      console.error('document_read_failed', d?.id || 'queue');
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(tick, 2000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
