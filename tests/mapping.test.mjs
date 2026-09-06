import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateMapping, mappingKml } from '../server/geometry.mjs';
const total = {
  id: 'total-1',
  name: 'Matrícula <123> & área',
  kind: 'total',
  registry: '123 & 456',
  registry_office: 'Cartório de teste',
  car: 'RS-TESTE',
  sigef: 'SIGEF-TESTE',
  coordinates: [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
  ],
};
const productive = {
  id: 'talhao-1',
  name: 'Talhão',
  kind: 'productive',
  parent_id: 'total-1',
  crop: 'Soja',
  season: '2026/2027',
  coordinates: [
    [0.001, 0.001],
    [0.005, 0.001],
    [0.005, 0.005],
    [0.001, 0.005],
  ],
};
test('geometria calcula ha, fecha anel, herda matrícula e mantém produtiva separada', () => {
  const m = validateMapping([total, productive]);
  assert.ok(m.summary.total_ha > 123.64 && m.summary.total_ha < 123.65);
  assert.ok(m.summary.productive_ha > 19.78 && m.summary.productive_ha < 19.79);
  assert.ok(
    Math.abs(
      m.summary.unclassified_ha -
        (m.summary.total_ha - m.summary.productive_ha),
    ) < 1e-8,
  );
  assert.deepEqual(
    m.features[0].coordinates[0],
    m.features[0].coordinates.at(-1),
  );
  assert.equal(m.features[1].registry, total.registry);
  assert.equal(m.summary.vertices, 8);
  assert.equal(
    validateMapping([total, { ...productive, crop: '', season: '' }])
      .features[1].crop,
    '',
  );
});
test('geometria rejeita cruzamentos, fora do perímetro, repetições e sobreposição; aceita borda comum', () => {
  for (const coordinates of [
    [
      [0, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0.01, 0],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    [
      [0, 0],
      [NaN, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [181, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [0.01, 0],
      [0.005, 0],
      [0.01, 0.01],
      [0, 0.01],
    ],
  ])
    assert.throws(() => validateMapping([{ ...total, coordinates }]));
  assert.throws(
    () =>
      validateMapping([
        total,
        {
          ...productive,
          coordinates: [
            [-1, 0],
            [1, 0],
            [1, 1],
            [-1, 1],
          ],
        },
      ]),
    /dentro/,
  );
  assert.throws(
    () =>
      validateMapping([total, { ...productive, parent_id: 'outro-imovel' }]),
    /vincule/,
  );
  assert.throws(
    () => validateMapping([total, { ...total, id: 'total-2' }]),
    /sobrepostas/,
  );
  assert.throws(
    () =>
      validateMapping([total, productive, { ...productive, id: 'talhao-2' }]),
    /sobrepostas/,
  );
  assert.throws(
    () => validateMapping([total, { ...productive, id: 'total-1' }]),
    /duplicado/,
  );
  const next = {
    ...productive,
    id: 'talhao-2',
    coordinates: [
      [0.005, 0.001],
      [0.009, 0.001],
      [0.009, 0.005],
      [0.005, 0.005],
    ],
  };
  assert.equal(
    validateMapping([total, productive, next]).summary.productive_count,
    2,
  );
  const concave = {
    ...total,
    coordinates: [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0.007, 0.01],
      [0.007, 0.003],
      [0.003, 0.003],
      [0.003, 0.01],
      [0, 0.01],
    ],
  };
  const bridge = {
    ...productive,
    coordinates: [
      [0.001, 0.009],
      [0.009, 0.009],
      [0.001, 0.001],
    ],
  };
  assert.throws(
    () => validateMapping([concave, bridge]),
    /dentro/,
    'Vértices dentro não bastam; arestas também precisam estar contidas.',
  );
});
test('KML válido preserva eixos, áreas, legenda de matrícula e pontos; escapa conteúdo', () => {
  const m = validateMapping([
    total,
    { ...productive, crop: '<script>alert(1)</script>' },
  ]);
  const kml = mappingKml(
    {
      ...m,
      revision: 3,
      created_at: '2026-09-06T12:00:00Z',
      property_snapshot: {
        name: 'Imóvel & <Teste>',
        municipality: 'Município / RS',
      },
    },
    { name: 'Produtor' },
  );
  assert.ok(!kml.includes('<script>'));
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      `import sys,xml.etree.ElementTree as E,json
r=E.fromstring(sys.stdin.read()); n={'k':'http://www.opengis.net/kml/2.2'}
polys=r.findall('.//k:Polygon',n);points=r.findall('.//k:Point',n)
assert len(polys)==2 and len(points)==8
for p in polys:
 c=p.find('.//k:coordinates',n).text.split();assert c[0]==c[-1]
assert len(r.findall('.//k:Data[@name="Matrícula"]',n))==2
assert points[0].find('k:coordinates',n).text=='0.0000000,0.0000000,0'
print('KML XML, legendas e pontos válidos')`,
    ],
    { input: kml, encoding: 'utf8' },
  );
  assert.equal(parsed.status, 0, parsed.stderr);
});
