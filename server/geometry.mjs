import { area } from '@turf/area';
import { kinks } from '@turf/kinks';
import clipping from 'polygon-clipping';

const check = (ok, message) => {
  if (!ok) throw Object.assign(new Error(message), { status: 400 });
};
const text = (v, n = 200) =>
  typeof v === 'string' ? v.trim().slice(0, n) : '';
const polygon = (coordinates) => ({
  type: 'Polygon',
  coordinates: [coordinates],
});
const hectares = (coordinates) =>
  coordinates.length ? area({ type: 'MultiPolygon', coordinates }) / 10000 : 0;
export function ringArea(coordinates) {
  return area(polygon(coordinates)) / 10000;
}

// Stored GeoJSON/KML coordinates are always [longitude, latitude], WGS84.
export function validateMapping(input) {
  check(
    Array.isArray(input) && input.length <= 80,
    'Mapeamento limitado a 80 áreas por propriedade.',
  );
  let vertices = 0;
  const ids = new Set();
  const features = input.map((f) => {
    check(f && typeof f === 'object', 'Área inválida.');
    const id = text(f.id, 80),
      name = text(f.name);
    check(
      /^[a-zA-Z0-9_-]{1,80}$/.test(id) && !ids.has(id),
      'Identificador de área inválido ou duplicado.',
    );
    ids.add(id);
    check(name, 'Informe o nome de cada área.');
    check(['total', 'productive'].includes(f.kind), 'Tipo de área inválido.');
    check(
      Array.isArray(f.coordinates) &&
        f.coordinates.length >= 3 &&
        f.coordinates.length <= 501,
      name + ': informe de 3 a 500 vértices.',
    );
    let ring = f.coordinates.map((p) => {
      check(
        Array.isArray(p) &&
          p.length === 2 &&
          p.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 85,
        name + ': coordenada inválida.',
      );
      return p.map((v) => Number(v.toFixed(7)));
    });
    if (ring[0].join() === ring.at(-1).join()) ring.pop();
    check(
      ring.length >= 3 &&
        ring.length <= 500 &&
        new Set(ring.map((p) => p.join())).size === ring.length,
      name + ': vértices repetidos ou insuficientes.',
    );
    vertices += ring.length;
    check(vertices <= 5000, 'Limite de 5.000 vértices por propriedade.');
    check(
      Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0])) <
        10 &&
        Math.max(...ring.map((p) => p[1])) -
          Math.min(...ring.map((p) => p[1])) <
          10,
      name +
        ': extensão incompatível com um imóvel rural. Confira as coordenadas.',
    );
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length],
        b = ring[i],
        c = ring[(i + 1) % ring.length];
      const u = [b[0] - a[0], b[1] - a[1]],
        v = [c[0] - b[0], c[1] - b[1]];
      check(
        !(
          Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-16 &&
          u[0] * v[0] + u[1] * v[1] < 0
        ),
        name + ': trecho sobreposto no próprio contorno. Ajuste os vértices.',
      );
    }
    const signed = ring.reduce((n, p, i) => {
      const next = ring[(i + 1) % ring.length];
      return n + p[0] * next[1] - next[0] * p[1];
    }, 0);
    if (signed < 0) ring = [ring[0], ...ring.slice(1).reverse()];
    ring.push([...ring[0]]);
    check(
      kinks(polygon(ring)).features.length === 0,
      name + ': o contorno cruza a si mesmo. Ajuste os vértices.',
    );
    const area_ha = ringArea(ring);
    check(
      Number.isFinite(area_ha) && area_ha > 0.0001,
      name + ': polígono sem superfície válida.',
    );
    const result = {
      id,
      name,
      kind: f.kind,
      coordinates: ring,
      area_ha,
      source: 'Mapeamento informado pelo usuário',
    };
    for (const key of [
      'registry',
      'registry_office',
      'registry_holder',
      'car',
      'sigef',
      'crop',
      'season',
      'parent_id',
    ])
      result[key] = text(f[key]);
    result.notes = text(f.notes, 2000);
    if (f.kind === 'total') {
      result.parent_id = '';
      result.crop = '';
      result.season = '';
    }
    return result;
  });
  const totals = features.filter((f) => f.kind === 'total');
  const productive = features.filter((f) => f.kind === 'productive');
  for (const f of productive) {
    const parent = totals.find((p) => p.id === f.parent_id);
    check(parent, f.name + ': vincule a uma área total desta propriedade.');
    for (const key of [
      'registry',
      'registry_office',
      'registry_holder',
      'car',
      'sigef',
    ])
      f[key] = parent[key];
    check(
      hectares(clipping.difference([f.coordinates], [parent.coordinates])) <
        0.000001,
      f.name + ': a área produtiva deve ficar dentro da área total vinculada.',
    );
  }
  // A physical hectare belongs to one current perimeter/talhão; touching edges are allowed.
  for (const group of [totals, productive])
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        check(
          hectares(
            clipping.intersection(
              [group[i].coordinates],
              [group[j].coordinates],
            ),
          ) < 0.000001,
          group[i].name +
            ' e ' +
            group[j].name +
            ': áreas do mesmo tipo sobrepostas. Ajuste os limites para evitar duplicidade.',
        );
      }
  const sum = (xs) => xs.reduce((n, f) => n + f.area_ha, 0);
  const total_ha = sum(totals),
    productive_ha = sum(productive);
  return {
    features,
    summary: {
      total_ha,
      productive_ha,
      unclassified_ha: Math.max(0, total_ha - productive_ha),
      total_count: totals.length,
      productive_count: productive.length,
      vertices,
      crs: 'WGS84 / EPSG:4326',
      method:
        'Área geodésica aproximada (Turf); não substitui levantamento certificado.',
    },
  };
}

// XML escaping is applied both to markup and to HTML interpreted by KML viewers.
const xml = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[c],
    );
export function mappingKml(
  { features, summary, revision, created_at, property_snapshot },
  producer,
) {
  const property = property_snapshot;
  const info = (f) => ({
    Produtor: producer.name,
    Propriedade: property.name,
    Município: property.municipality,
    Área: f.name,
    Tipo: f.kind === 'total' ? 'Área total' : 'Área produtiva',
    Hectares: f.area_ha.toFixed(4),
    'Cultura atual': f.crop || 'Não informada',
    'Safra / período': f.season || 'Não informado',
    Matrícula: f.registry || 'Não informada',
    'Cartório / comarca': f.registry_office || 'Não informado',
    'Titular na matrícula': f.registry_holder || 'Não informado',
    'CAR informado': f.car || 'Não informado',
    'SIGEF informado': f.sigef || 'Não informado',
    Fonte: f.source,
    'Versão do mapa': revision,
    'Data da versão': created_at,
    Coordenadas: 'WGS84 — longitude, latitude',
    Observações: f.notes || '—',
  });
  const extended = (data) =>
    '<ExtendedData>' +
    Object.entries(data)
      .map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`)
      .join('') +
    '</ExtendedData>';
  const description = (data) =>
    '<description>' +
    xml(
      '<table>' +
        Object.entries(data)
          .map(
            ([k, v]) =>
              '<tr><th>' + xml(k) + '</th><td>' + xml(v) + '</td></tr>',
          )
          .join('') +
        '</table>',
    ) +
    '</description>';
  const docData = {
    Produtor: producer.name,
    Propriedade: property.name,
    Versão: revision,
    'Área total (ha)': summary.total_ha.toFixed(4),
    'Área produtiva (ha)': summary.productive_ha.toFixed(4),
    'Sem classificação produtiva (ha)': summary.unclassified_ha.toFixed(4),
    Legenda:
      'Azul: área total. Verde: área produtiva. Pontos: vértices numerados. Matrícula/CAR/SIGEF: referências informadas, sem certificação automática.',
    Método: summary.method,
  };
  const folders = ['total', 'productive']
    .map(
      (kind) =>
        `<Folder><name>${kind === 'total' ? 'Área total — azul' : 'Área produtiva — verde'}</name>${features
          .filter((f) => f.kind === kind)
          .map((f) => {
            const data = info(f),
              points = f.coordinates.slice(0, -1);
            return `<Folder><name>${xml(f.name)} · Matrícula ${xml(f.registry || 'não informada')}</name><Placemark><name>${xml(f.name)}</name><styleUrl>#${kind}</styleUrl>${description(data)}${extended(data)}<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${f.coordinates.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark><Folder><name>Vértices — ${xml(f.name)}</name>${points.map(([x, y], i) => `<Placemark><name>V${String(i + 1).padStart(3, '0')}</name>${description({ Área: f.name, Matrícula: f.registry || 'Não informada', Latitude: y.toFixed(7), Longitude: x.toFixed(7) })}<Point><coordinates>${x.toFixed(7)},${y.toFixed(7)},0</coordinates></Point></Placemark>`).join('')}</Folder></Folder>`;
          })
          .join('')}</Folder>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(property.name)} — mapa v${revision}</name>${description(docData)}${extended(docData)}<Style id="total"><LineStyle><color>ffff9933</color><width>3</width></LineStyle><PolyStyle><color>33ff9933</color></PolyStyle></Style><Style id="productive"><LineStyle><color>ff55bb22</color><width>3</width></LineStyle><PolyStyle><color>6655bb22</color></PolyStyle></Style>${folders}</Document></kml>`;
}
