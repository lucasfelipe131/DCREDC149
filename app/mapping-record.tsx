'use client';
type Row = Record<string, any>;
const ha = (v: any) =>
  Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' ha';
export function MappingRecord({
  property,
  expanded = false,
}: {
  property: Row;
  expanded?: boolean;
}) {
  const m = property.mapping;
  if (!m?.features?.length)
    return (
      <p className="producer-note">
        Perímetro e área produtiva ainda não mapeados para {property.name}.
      </p>
    );
  const points: number[][] = m.features.flatMap((f: Row) => f.coordinates);
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const west = Math.min(...xs),
    east = Math.max(...xs),
    south = Math.min(...ys),
    north = Math.max(...ys);
  const cos = Math.cos((((north + south) / 2) * Math.PI) / 180),
    width = Math.max((east - west) * cos, 0.000001),
    height = Math.max(north - south, 0.000001);
  const scale = Math.min(600 / width, 290 / height);
  const xy = ([x, y]: number[]) => [
    30 + (600 - width * scale) / 2 + (x - west) * cos * scale,
    25 + (290 - height * scale) / 2 + (north - y) * scale,
  ];
  return (
    <details className="mapping-record" open={expanded}>
      <summary>
        Mapa e memorial de {property.name} · versão {m.revision} ·{' '}
        {ha(m.summary.total_ha)} total / {ha(m.summary.productive_ha)} produtiva
      </summary>
      <div className="mapping-record-content">
        <p>
          Versão salva em {new Date(m.created_at).toLocaleString('pt-BR')}.
          Azul: área total. Verde: área produtiva. Coordenadas WGS84.{' '}
          {m.summary.method}
        </p>
        <svg
          viewBox="0 0 660 340"
          role="img"
          aria-label={'Contornos mapeados de ' + property.name}
          className="mapping-diagram"
        >
          <rect width="660" height="340" fill="#f4f7fa" />
          {[...m.features]
            .sort((a: Row, b: Row) =>
              a.kind === b.kind ? 0 : a.kind === 'total' ? -1 : 1,
            )
            .map((f: Row) => (
              <g key={f.id}>
                <polygon
                  points={f.coordinates
                    .map((p: number[]) => xy(p).join(','))
                    .join(' ')}
                  fill={f.kind === 'total' ? '#3399ff22' : '#22bb5555'}
                  stroke={f.kind === 'total' ? '#267acc' : '#15853c'}
                  strokeWidth="2"
                />
                {f.coordinates.slice(0, -1).map((p: number[], i: number) => {
                  const [x, y] = xy(p);
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="2.5"
                        fill={f.kind === 'total' ? '#267acc' : '#15853c'}
                      />
                      {f.coordinates.length <= 31 && (
                        <text x={x + 4} y={y - 4} fontSize="10" fill="#16334a">
                          V{i + 1}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            ))}
          <text x="630" y="20" fontSize="14">
            N ↑
          </text>
          <text x="15" y="332" fontSize="11">
            Croqui dos contornos informados · sem base de imagem · não
            certificado
          </text>
        </svg>
        <div className="producer-screen-actions r-print-actions">
          <a
            className="r-btn r-btn-secondary"
            href={
              '/api/properties/' +
              property.id +
              '/mapping/kml?revision=' +
              m.revision
            }
          >
            Baixar KML desta versão
          </a>
        </div>
        {m.features.map((f: Row) => (
          <section className="mapping-memorial" key={f.id}>
            <h4>
              {f.name} · {f.kind === 'total' ? 'Área total' : 'Área produtiva'}{' '}
              · {ha(f.area_ha)}
            </h4>
            <p>
              Matrícula: {f.registry || 'pendente'} · Cartório/comarca:{' '}
              {f.registry_office || 'pendente'} · Titular:{' '}
              {f.registry_holder || 'pendente'}
              <br />
              CAR: {f.car || 'não informado'} · SIGEF:{' '}
              {f.sigef || 'não informado'}
              {f.kind === 'productive' && (
                <>
                  <br />
                  Cultura: {f.crop || 'pendente'} · Safra/período:{' '}
                  {f.season || 'pendente'}
                </>
              )}
            </p>
            {f.notes && <p>{f.notes}</p>}
            <table>
              <thead>
                <tr>
                  <th>Vértice</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                </tr>
              </thead>
              <tbody>
                {f.coordinates
                  .slice(0, -1)
                  .map(([lng, lat]: number[], i: number) => (
                    <tr key={i}>
                      <td>V{String(i + 1).padStart(3, '0')}</td>
                      <td>{lat.toFixed(7)}</td>
                      <td>{lng.toFixed(7)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </details>
  );
}
