// Public municipal references only. No producer names, documents or farm coordinates
// are sent to IBGE. Municipal bounds are never saved as a farm location.
const base = 'https://servicodados.ibge.gov.br/api';
const cache = new Map();
const pending = new Map();
const fail = () =>
  Object.assign(
    new Error(
      'Não foi possível consultar o município no IBGE. Você pode navegar no mapa ou informar as coordenadas.',
    ),
    { status: 503 },
  );
const normalize = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function publicData(path) {
  const old = cache.get(path);
  if (old && old.until > Date.now()) return old.value;
  if (pending.has(path)) return pending.get(path);
  if (pending.size >= 3) throw fail();
  const job = (async () => {
    try {
      const res = await fetch(base + path, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw fail();
      const value = await res.json();
      if (cache.size >= 120) cache.delete(cache.keys().next().value);
      cache.set(path, { value, until: Date.now() + 86400000 });
      return value;
    } catch {
      throw fail();
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, job);
  return job;
}

export async function findMunicipalities(name) {
  const q = normalize(name);
  if (q.length < 3 || q.length > 120)
    throw Object.assign(
      new Error(
        'Informe ao menos três letras do município, com UF se necessário.',
      ),
      { status: 400 },
    );
  const all = await publicData('/v1/localidades/municipios');
  if (!Array.isArray(all)) throw fail();
  return all
    .map((city) => ({
      id: city.id,
      name: city.nome,
      uf:
        city.microrregiao?.mesorregiao?.UF?.sigla ||
        city['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ||
        '',
    }))
    .filter((city) => normalize(city.name + ' ' + city.uf).includes(q))
    .slice(0, 20);
}

export function geographicBounds(geo) {
  let south = 90,
    north = -90,
    west = 180,
    east = -180,
    points = 0;
  function visit(coords) {
    if (!Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      const [lon, lat] = coords;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw fail();
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      points++;
    } else coords.forEach(visit);
  }
  const geometries =
    geo.type === 'FeatureCollection'
      ? geo.features.map((f) => f.geometry)
      : [geo.type === 'Feature' ? geo.geometry : geo];
  for (const geometry of geometries) visit(geometry?.coordinates);
  if (!points || north <= south || east <= west) throw fail();
  return [
    [south, west],
    [north, east],
  ];
}

export async function municipalityBounds(id) {
  if (!/^\d{7}$/.test(id))
    throw Object.assign(new Error('Código municipal inválido.'), {
      status: 400,
    });
  const geo = await publicData(
    '/v3/malhas/municipios/' +
      id +
      '?formato=application%2Fvnd.geo%2Bjson&qualidade=minima',
  );
  return {
    bounds: geographicBounds(geo),
    source: 'IBGE — referência municipal, não perímetro da propriedade',
  };
}
