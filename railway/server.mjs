import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { database, initialize } from '../server/db.mjs';
import { createApi, send, startDocumentWorker } from '../server/api.mjs';

if (!process.env.DATABASE_URL)
  throw Error('Configure DATABASE_URL antes de iniciar.');
const db = database(process.env.DATABASE_URL);
await initialize(db);
const api = createApi(db),
  stopWorker = startDocumentWorker(db),
  root = resolve('dist-railway');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    if (req.url === '/health') {
      await db.query('SELECT 1');
      return send(res, 200, {
        status: 'ok',
        mode: 'operational',
        storage: 'postgresql',
      });
    }
    const user = await api.authenticate(req);
    if (!user) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="CREDITO C149", charset="UTF-8"',
        'Cache-Control': 'no-store',
      });
      return res.end('Autenticação necessária.');
    }
    if (req.url.startsWith('/api/')) return await api.handle(req, res, user);
    if (!['GET', 'HEAD'].includes(req.method))
      return send(res, 405, { error: 'Método não permitido.' });
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://local').pathname,
    );
    const file = resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : pathname),
    );
    if (!file.startsWith(root + sep))
      return send(res, 403, { error: 'Acesso não permitido.' });
    const content = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) {
    const status =
      e.status ||
      (e.code === '23505'
        ? 409
        : e.code === '23503'
          ? 400
          : e.code === 'ENOENT'
            ? 404
            : 500);
    const message = e.status
      ? e.message
      : status === 409
        ? 'Já existe cadastro com esse CPF/CNPJ, usuário ou documento nesta solicitação.'
        : status === 400
          ? 'Vínculo inválido. Atualize e tente novamente.'
          : status === 404
            ? 'Não encontrado.'
            : 'Não foi possível concluir. Tente novamente.';
    if (status === 500) console.error('request_failed', e.code || e.name);
    if (!res.headersSent) send(res, status, { error: message });
    else res.end();
  }
});
server.requestTimeout = 60000;
server.headersTimeout = 20000;
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () =>
  console.log('CREDITO C149 operational server ready'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopWorker();
    server.close(() => {
      void db.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
