'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import { PropertyMap, type Point } from './property-map';
import { validateMapping } from '../server/geometry.mjs';

type Row = Record<string, any>;
export type MappingDraft = {
  features: Row[];
  revision: number;
  ready: boolean;
  drawing: boolean;
  dirty: boolean;
};
const ha = (n: any) =>
  Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }) + ' ha';
async function request(path: string, method = 'GET', body?: any) {
  const r = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Credit-Request': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await r.json();
  if (!r.ok) throw Error(data.error || 'Não foi possível consultar o mapa.');
  return data;
}
export function AreaMapping({
  property,
  properties,
  selectedId,
  municipality,
  writable,
  onSaved,
  onSelect,
  editablePin = false,
  pin,
  onPick,
  formMode = false,
  onDraftChange,
  onEditingChange,
}: {
  property?: Row;
  properties: Row[];
  selectedId?: string;
  municipality?: string;
  writable: boolean;
  onSaved?: () => Promise<void>;
  onSelect?: (id: string) => void;
  editablePin?: boolean;
  pin?: Point | null;
  onPick?: (p: Point) => void;
  formMode?: boolean;
  onDraftChange?: (value: MappingDraft) => void;
  onEditingChange?: (value: boolean) => void;
}) {
  const [features, setFeatures] = useState<Row[]>([]),
    [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Row | null>(null),
    [active, setActive] = useState(''),
    [filter, setFilter] = useState(''),
    [kindFilter, setKindFilter] = useState('all');
  const [onlyCar, setOnlyCar] = useState(false),
    [onlySigef, setOnlySigef] = useState(false),
    [onlyRegistry, setOnlyRegistry] = useState(false),
    [vertices, setVertices] = useState(true),
    [registryLabels, setRegistryLabels] = useState(true);
  const [versions, setVersions] = useState<Row[]>([]),
    [viewVersion, setViewVersion] = useState(''),
    [versionDate, setVersionDate] = useState(''),
    [attempt, setAttempt] = useState(0);
  const latestRevision = useRef(0),
    fileSaved = useRef(onSaved);
  fileSaved.current = onSaved;
  const callback = useRef(onDraftChange);
  callback.current = onDraftChange;
  const editingCallback = useRef(onEditingChange);
  editingCallback.current = onEditingChange;
  useEffect(() => {
    editingCallback.current?.(dirty || !!draft);
  }, [dirty, draft]);
  const propertyId = property?.id;
  const historical =
    !!viewVersion && Number(viewVersion) !== latestRevision.current;
  const editingAllowed =
    writable &&
    (formMode || !!propertyId) &&
    ready &&
    !busy &&
    !historical &&
    (!editablePin || formMode);
  useEffect(() => {
    let live = true;
    setReady(false);
    setFeatures([]);
    setRevision(0);
    setDirty(false);
    setDraft(null);
    setError('');
    setActive('');
    if (!propertyId) {
      setReady(true);
      latestRevision.current = 0;
      return;
    }
    request(
      '/properties/' +
        propertyId +
        '/mapping' +
        (viewVersion ? '?revision=' + viewVersion : ''),
    )
      .then((r) => {
        if (!live) return;
        setFeatures(r.features);
        setRevision(r.revision);
        setVersionDate(r.created_at || '');
        if (!viewVersion) latestRevision.current = r.revision;
        setReady(true);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [propertyId, viewVersion, attempt]);
  useEffect(() => {
    callback.current?.({ features, revision, ready, drawing: !!draft, dirty });
  }, [features, revision, ready, draft, dirty]);
  useEffect(() => {
    if (!dirty && !draft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, draft]);
  const summary = useMemo<Row | null>(() => {
    try {
      return validateMapping(features).summary;
    } catch {
      return null;
    }
  }, [features]);
  const filtered = features.filter(
    (f) =>
      (kindFilter === 'all' || f.kind === kindFilter) &&
      (!onlyCar || f.car) &&
      (!onlySigef || f.sigef) &&
      (!onlyRegistry || f.registry) &&
      [f.name, f.registry, f.registry_office, f.car, f.sigef, f.crop]
        .join(' ')
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
  );
  const focused = draft || features.find((f) => f.id === active);
  const totals = features.filter((f) => f.kind === 'total');
  function start(kind: string) {
    setDraft({
      id: crypto.randomUUID(),
      name: '',
      kind,
      parent_id: kind === 'productive' ? totals[0]?.id || '' : '',
      crop: '',
      season: '',
      registry: property?.registry || '',
      registry_office: '',
      registry_holder: '',
      car: property?.car || '',
      sigef: '',
      notes: '',
      coordinates: [],
    });
    setError('');
    setNotice('');
  }
  function change(key: string, value: any) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  function move(index: number, p: Point) {
    if (
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude) > 85 ||
      Math.abs(p.longitude) > 180
    ) {
      setError('Coordenada fora do intervalo permitido.');
      return;
    }
    setDraft((d) =>
      d
        ? {
            ...d,
            coordinates: d.coordinates.map((c: number[], i: number) =>
              i === index ? [p.longitude, p.latitude] : c,
            ),
          }
        : d,
    );
  }
  function complete() {
    if (!draft) return;
    try {
      const candidate = features.filter((f) => f.id !== draft.id).concat(draft);
      const valid = validateMapping(candidate);
      setFeatures(valid.features);
      setActive(draft.id);
      setDraft(null);
      setDirty(true);
      setError('');
      setNotice(
        formMode
          ? 'Área preparada. Salve o cadastro para confirmar.'
          : 'Área preparada. Clique em Salvar mapeamento para confirmar.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function edit(f: Row) {
    setActive(f.id);
    setDraft({
      ...f,
      coordinates: f.coordinates.slice(0, -1).map((p: number[]) => [...p]),
    });
    setError('');
    setNotice('');
  }
  function remove(f: Row) {
    if (f.kind === 'total' && features.some((a) => a.parent_id === f.id)) {
      setError(
        'Remova ou desvincule os talhões produtivos antes de excluir esta área total.',
      );
      return;
    }
    if (
      !window.confirm(
        'Remover a área “' +
          f.name +
          '” desta versão do mapa? As versões já salvas serão preservadas.',
      )
    )
      return;
    setFeatures((xs) => xs.filter((a) => a.id !== f.id));
    setDirty(true);
    setActive('');
  }
  async function save() {
    if (!propertyId || busy || draft) return;
    setBusy(true);
    setError('');
    try {
      const r = await request('/properties/' + propertyId + '/mapping', 'PUT', {
        features,
        revision,
      });
      setFeatures(r.features);
      setRevision(r.revision);
      latestRevision.current = r.revision;
      setViewVersion('');
      setDirty(false);
      setNotice('Mapeamento salvo — versão ' + r.revision + '.');
      setVersionDate(new Date().toISOString());
      await fileSaved.current?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function history() {
    try {
      setVersions(
        await request('/properties/' + propertyId + '/mapping/versions'),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <PropertyMap
      properties={properties}
      selectedId={selectedId}
      municipality={municipality}
      editable={editablePin && !draft && ready && !busy}
      onPick={onPick}
      onSelect={dirty || draft || busy ? undefined : onSelect}
      draft={pin}
      formMode={formMode}
      polygons={filtered.filter((f) => f.id !== draft?.id)}
      drawing={draft?.coordinates || []}
      activeAreaId={active}
      showVertices={vertices}
      showRegistry={registryLabels}
      onDrawPoint={
        draft && editingAllowed
          ? (p) => {
              if (draft.coordinates.length >= 500) {
                setError('Limite de 500 vértices por área.');
                return;
              }
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      coordinates: [
                        ...d.coordinates,
                        [p.longitude, p.latitude],
                      ],
                    }
                  : d,
              );
            }
          : undefined
      }
      onVertexMove={draft && editingAllowed ? move : undefined}
      onAreaSelect={draft ? undefined : setActive}
      toolbar={
        <>
          <div className="area-toolbar producer-screen-actions">
            {editingAllowed && !draft && (
              <>
                <button
                  type="button"
                  className="r-btn r-btn-secondary"
                  onClick={() => start('total')}
                >
                  <Plus size={16} /> Área total
                </button>
                <button
                  type="button"
                  className="r-btn r-btn-secondary"
                  disabled={!totals.length}
                  onClick={() => start('productive')}
                >
                  <Plus size={16} /> Área produtiva / cultura
                </button>
              </>
            )}
            {!formMode && editingAllowed && (
              <button
                type="button"
                className="r-btn"
                disabled={!dirty || !!draft}
                onClick={() => void save()}
              >
                <Save size={16} />
                {busy ? 'Salvando…' : 'Salvar mapeamento'}
              </button>
            )}
            {!formMode &&
              propertyId &&
              revision > 0 &&
              !dirty &&
              !draft &&
              features.length > 0 && (
                <a
                  className="r-btn r-btn-secondary"
                  href={
                    '/api/properties/' +
                    propertyId +
                    '/mapping/kml?revision=' +
                    revision
                  }
                >
                  <Download size={16} /> Baixar KML · v{revision}
                </a>
              )}
            {!formMode && dirty && !draft && (
              <button
                type="button"
                className="r-btn r-btn-secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Descartar as alterações não salvas e abrir a versão atual?',
                    )
                  ) {
                    setViewVersion('');
                    setAttempt((n) => n + 1);
                    setNotice('');
                  }
                }}
              >
                Descartar alterações
              </button>
            )}
            {!formMode && propertyId && (
              <button
                type="button"
                className="r-btn r-btn-secondary"
                disabled={dirty || !!draft}
                onClick={() => void history()}
              >
                Versões do mapa
              </button>
            )}
            {versions.length > 0 && (
              <select
                aria-label="Versão do mapa"
                value={viewVersion}
                disabled={dirty || !!draft || busy}
                onChange={(e) => setViewVersion(e.target.value)}
              >
                <option value="">Versão atual</option>
                {versions.map((v) => (
                  <option key={v.revision} value={v.revision}>
                    v{v.revision} ·{' '}
                    {new Date(v.created_at).toLocaleString('pt-BR')} ·{' '}
                    {v.actor_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="area-filters producer-screen-actions">
            <input
              aria-label="Filtrar áreas por matrícula CAR SIGEF ou cultura"
              placeholder="Buscar área, matrícula, CAR, SIGEF ou cultura"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              aria-label="Tipo de área exibida"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="all">Todas as áreas</option>
              <option value="total">Área total</option>
              <option value="productive">Área produtiva</option>
            </select>
            <label>
              <input
                type="checkbox"
                checked={onlyCar}
                onChange={(e) => setOnlyCar(e.target.checked)}
              />{' '}
              Com CAR
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlySigef}
                onChange={(e) => setOnlySigef(e.target.checked)}
              />{' '}
              Com SIGEF
            </label>
            <label>
              <input
                type="checkbox"
                checked={onlyRegistry}
                onChange={(e) => setOnlyRegistry(e.target.checked)}
              />{' '}
              Com matrícula
            </label>
            <label>
              <input
                type="checkbox"
                checked={vertices}
                onChange={(e) => setVertices(e.target.checked)}
              />{' '}
              Vértices
            </label>
            <label>
              <input
                type="checkbox"
                checked={registryLabels}
                onChange={(e) => setRegistryLabels(e.target.checked)}
              />{' '}
              Legenda de matrícula
            </label>
          </div>
          {!ready && !error && (
            <p role="status" className="producer-map-message">
              Carregando mapeamento salvo…
            </p>
          )}
          {historical && (
            <p className="producer-map-message">
              Consulta da versão histórica {revision}. A edição está disponível
              na versão atual.
            </p>
          )}
          {draft && (
            <div className="area-drawing-bar producer-screen-actions">
              <strong>
                {draft.kind === 'total'
                  ? 'Desenhando área total'
                  : 'Desenhando área produtiva'}{' '}
                · {draft.coordinates.length} vértices
              </strong>
              <button
                type="button"
                onClick={() =>
                  change('coordinates', draft.coordinates.slice(0, -1))
                }
                disabled={!draft.coordinates.length}
              >
                <Undo2 size={15} /> Desfazer ponto
              </button>
              <button type="button" onClick={complete}>
                <Save size={15} /> Concluir área
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError('');
                }}
              >
                <X size={15} /> Cancelar desenho
              </button>
            </div>
          )}
        </>
      }
    >
      {error && (
        <p role="alert" className="producer-map-message r-error">
          {error}
          {!ready && (
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Tentar novamente
            </button>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="producer-map-message">
          {notice}
        </p>
      )}
      {summary && (
        <div className="area-metrics">
          <div>
            <span>Área total mapeada</span>
            <strong>{ha(summary.total_ha)}</strong>
          </div>
          <div>
            <span>Área produtiva mapeada</span>
            <strong>{ha(summary.productive_ha)}</strong>
          </div>
          <div>
            <span>Sem classificação produtiva</span>
            <strong>{ha(summary.unclassified_ha)}</strong>
          </div>
        </div>
      )}
      {!formMode && property?.area_ha && summary && summary.total_count > 0 && (
        <p className="area-method">
          Área declarada: {ha(property.area_ha)} · Diferença entre mapeada e
          declarada: {ha(summary.total_ha - Number(property.area_ha))}. Confira
          a origem dos limites e das medidas.
        </p>
      )}
      <p className="area-method">
        Azul: área total · Verde: área produtiva · Amarelo: desenho em edição.
        Medidas geodésicas aproximadas, WGS84.{' '}
        {dirty
          ? 'Alterações ainda não salvas.'
          : revision
            ? 'Versão ' +
              revision +
              (versionDate
                ? ' · ' + new Date(versionDate).toLocaleString('pt-BR')
                : '')
            : 'Nenhum polígono salvo.'}{' '}
        O KML inclui todas as áreas da versão salva, independentemente dos
        filtros.
      </p>
      {draft && (
        <div className="area-editor producer-screen-actions">
          <h3>
            Dados da {draft.kind === 'total' ? 'área total' : 'área produtiva'}
          </h3>
          <div className="area-fields">
            <label>
              Nome da área *
              <input
                value={draft.name}
                maxLength={200}
                onChange={(e) => change('name', e.target.value)}
                placeholder="Ex.: Matrícula 1234 ou Talhão 1"
              />
            </label>
            {draft.kind === 'productive' ? (
              <>
                <label>
                  Área total vinculada *
                  <select
                    value={draft.parent_id}
                    onChange={(e) => change('parent_id', e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {totals.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · matrícula {t.registry || 'não informada'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cultura atual
                  <input
                    list="rural-crops"
                    value={draft.crop}
                    maxLength={200}
                    onChange={(e) => change('crop', e.target.value)}
                    placeholder="Informe a cultura ou deixe pendente"
                  />
                  <datalist id="rural-crops">
                    {[
                      'Soja',
                      'Milho',
                      'Trigo',
                      'Canola',
                      'Arroz',
                      'Pastagem',
                      'Pousio',
                    ].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Safra / período de referência
                  <input
                    value={draft.season}
                    maxLength={200}
                    onChange={(e) => change('season', e.target.value)}
                    placeholder="Ex.: 2026/2027"
                  />
                </label>
                <p className="area-wide">
                  Matrícula, cartório, CAR e SIGEF serão os da área total
                  vinculada.
                </p>
              </>
            ) : (
              <>
                {[
                  ['registry', 'Número da matrícula'],
                  ['registry_office', 'Cartório / comarca'],
                  ['registry_holder', 'Titular informado na matrícula'],
                  ['car', 'Número do CAR informado'],
                  ['sigef', 'Código da parcela / certificação SIGEF'],
                ].map(([k, label]) => (
                  <label key={k}>
                    {label}
                    <input
                      value={draft[k]}
                      maxLength={200}
                      onChange={(e) => change(k, e.target.value)}
                    />
                  </label>
                ))}
              </>
            )}
            <label className="area-wide">
              Observações e fonte documental
              <textarea
                value={draft.notes}
                maxLength={2000}
                onChange={(e) => change('notes', e.target.value)}
              />
            </label>
          </div>
          <p>
            Marque os vértices no mapa. Para ajustar, arraste os pontos
            numerados ou edite as coordenadas abaixo. Conclua a área antes de
            salvar.
          </p>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="area-list">
          {filtered.map((f) => (
            <article className={active === f.id ? 'active' : ''} key={f.id}>
              <button
                type="button"
                className="area-select"
                onClick={() => setActive(f.id)}
              >
                <span className={'area-swatch ' + f.kind} />
                <strong>{f.name}</strong>
                <span>{ha(f.area_ha)}</span>
              </button>
              <p>
                {f.kind === 'total'
                  ? 'Área total'
                  : 'Área produtiva · ' +
                    (f.crop || 'Cultura pendente') +
                    (f.season ? ' · ' + f.season : ' · Safra pendente')}
              </p>
              {registryLabels && (
                <p>
                  Matrícula: {f.registry || 'pendente'} · Cartório:{' '}
                  {f.registry_office || 'pendente'} · Titular:{' '}
                  {f.registry_holder || 'pendente'}
                  <br />
                  CAR: {f.car || 'não informado'} · SIGEF:{' '}
                  {f.sigef || 'não informado'}
                </p>
              )}
              {editingAllowed && !draft && (
                <div className="producer-screen-actions">
                  <button type="button" onClick={() => edit(f)}>
                    <Pencil size={14} /> Editar contorno e dados
                  </button>
                  <button type="button" onClick={() => remove(f)}>
                    <Trash2 size={14} /> Remover área
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!features.length && ready && !draft && (
        <p className="producer-map-message">
          Use “Área total” para desenhar o perímetro; depois cadastre os talhões
          em “Área produtiva / cultura”. O pin localiza a propriedade, mas não
          define sua superfície.
        </p>
      )}
      {features.length > 0 && !filtered.length && (
        <p className="producer-map-message">
          Nenhuma área corresponde aos filtros.
        </p>
      )}
      {focused && (
        <details className="area-coordinates" open={!!draft}>
          <summary>
            Coordenadas dos vértices · {focused.name || 'área em desenho'} ·
            WGS84
          </summary>
          <div className="area-coordinate-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vértice</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  {draft && <th>Ajustar</th>}
                </tr>
              </thead>
              <tbody>
                {(draft
                  ? focused.coordinates
                  : focused.coordinates.slice(0, -1)
                ).map(([lng, lat]: number[], i: number) => (
                  <tr key={i}>
                    <td>V{String(i + 1).padStart(3, '0')}</td>
                    <td>
                      {draft ? (
                        <input
                          aria-label={'Latitude do vértice ' + (i + 1)}
                          type="number"
                          step="any"
                          min={-85}
                          max={85}
                          value={lat}
                          onChange={(e) =>
                            move(i, {
                              latitude:
                                e.target.value === ''
                                  ? NaN
                                  : Number(e.target.value),
                              longitude: lng,
                            })
                          }
                        />
                      ) : (
                        lat.toFixed(7)
                      )}
                    </td>
                    <td>
                      {draft ? (
                        <input
                          aria-label={'Longitude do vértice ' + (i + 1)}
                          type="number"
                          step="any"
                          min={-180}
                          max={180}
                          value={lng}
                          onChange={(e) =>
                            move(i, {
                              latitude: lat,
                              longitude:
                                e.target.value === ''
                                  ? NaN
                                  : Number(e.target.value),
                            })
                          }
                        />
                      ) : (
                        lng.toFixed(7)
                      )}
                    </td>
                    {draft && (
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            change(
                              'coordinates',
                              draft.coordinates.filter(
                                (_: any, j: number) => j !== i,
                              ),
                            )
                          }
                        >
                          Remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </PropertyMap>
  );
}
