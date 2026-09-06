'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Redo2,
  X,
  History,
  MousePointer2,
  Layers,
  LandPlot,
  Focus,
  PanelRightClose,
  HelpCircle,
  Check,
} from 'lucide-react';
import { PropertyMap, type Point } from './property-map';
import { mapRequest as request, historyRows } from './map-request.mjs';
import { MapVersions } from './map-versions';
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
  const [panel, setPanel] = useState<
    'none' | 'areas' | 'editor' | 'versions' | 'layers' | 'help'
  >('none');
  const [versionsLoading, setVersionsLoading] = useState(false),
    [versionsError, setVersionsError] = useState('');
  const [paused, setPaused] = useState(false),
    [undoStack, setUndoStack] = useState<number[][][]>([]),
    [redoStack, setRedoStack] = useState<number[][][]>([]);
  const [focusRequest, setFocusRequest] = useState<{
    nonce: number;
    areaId?: string;
  }>({ nonce: 0 });
  const historyController = useRef<AbortController | null>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (panel !== 'none' && panel !== 'layers') drawer.current?.focus();
  }, [panel]);
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
    const controller = new AbortController();
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
      'GET',
      undefined,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!live) return;
        setFeatures(r.features);
        setRevision(r.revision);
        setVersionDate(r.created_at || '');
        if (!viewVersion) latestRevision.current = r.revision;
        setReady(true);
        setNotice((n) =>
          n.startsWith('Abrindo versão')
            ? 'Versão ' + r.revision + ' aberta no mapa.'
            : n,
        );
        setFocusRequest((q) => ({ nonce: q.nonce + 1 }));
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [propertyId, viewVersion, attempt]);
  useEffect(() => {
    setVersions([]);
    setVersionsError('');
    setVersionsLoading(false);
    return () => historyController.current?.abort();
  }, [propertyId]);
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
    setPaused(false);
    setUndoStack([]);
    setRedoStack([]);
    setPanel('editor');
  }
  function change(key: string, value: any) {
    if (key === 'coordinates') {
      if (!draft) return;
      setUndoStack((xs) => [...xs.slice(-99), draft.coordinates]);
      setRedoStack([]);
    }
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  function undo() {
    if (!draft || !undoStack.length) return;
    setRedoStack((xs) => [...xs, draft.coordinates]);
    setDraft({ ...draft, coordinates: undoStack.at(-1)! });
    setUndoStack((xs) => xs.slice(0, -1));
  }
  function redo() {
    if (!draft || !redoStack.length) return;
    setUndoStack((xs) => [...xs, draft.coordinates]);
    setDraft({ ...draft, coordinates: redoStack.at(-1)! });
    setRedoStack((xs) => xs.slice(0, -1));
  }
  function cancelDrawing() {
    if (
      draft?.coordinates.length &&
      !window.confirm('Cancelar este desenho? A versão salva será preservada.')
    )
      return;
    setDraft(null);
    setError('');
    setPanel('none');
    setPaused(false);
  }
  function focusArea(id?: string) {
    if (id) {
      setOnlyCar(false);
      setOnlySigef(false);
      setOnlyRegistry(false);
      setFilter('');
      setKindFilter('all');
    }
    setFocusRequest((q) => ({ nonce: q.nonce + 1, areaId: id }));
  }
  function selectArea(id: string) {
    setActive(id);
    setPanel('areas');
  }
  function viewMap(v: number) {
    if (dirty || draft || busy) return;
    setPanel('none');
    setOnlyCar(false);
    setOnlySigef(false);
    setOnlyRegistry(false);
    setFilter('');
    setKindFilter('all');
    setViewVersion(v === latestRevision.current ? '' : String(v));
    setAttempt((n) => n + 1);
    setNotice('Abrindo versão ' + v + ' no mapa…');
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
    if (draft)
      change(
        'coordinates',
        draft.coordinates.map((c: number[], i: number) =>
          i === index ? [p.longitude, p.latitude] : c,
        ),
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
      setPanel('areas');
      setPaused(false);
      setNotice(
        formMode
          ? 'Área preparada. Salve o cadastro para confirmar.'
          : 'Área preparada. Clique em Salvar mapeamento para confirmar.',
      );
    } catch (e) {
      setError((e as Error).message);
      setPanel('editor');
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
    setPaused(false);
    setUndoStack([]);
    setRedoStack([]);
    setPanel('editor');
    focusArea(f.id);
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
      setVersionDate(r.created_at || new Date().toISOString());
      setVersions([]);
      await fileSaved.current?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function history() {
    setPanel('versions');
    setVersionsError('');
    historyController.current?.abort();
    if (!propertyId) {
      setVersions([]);
      setVersionsLoading(false);
      return;
    }
    const controller = new AbortController();
    historyController.current = controller;
    setVersionsLoading(true);
    try {
      const rows = historyRows(
        await request(
          '/properties/' + propertyId + '/mapping/versions',
          'GET',
          undefined,
          { signal: controller.signal },
        ),
      );
      if (!controller.signal.aborted) {
        setVersions(rows);
        if (rows.length)
          latestRevision.current = Math.max(
            ...rows.map((v: Row) => v.revision),
          );
      }
    } catch (e) {
      if (!controller.signal.aborted) setVersionsError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setVersionsLoading(false);
    }
  }
  const editorFields = (
    <>
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
    </>
  );
  const coordinateTable = (
    <>
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
    </>
  );
  const localLayerFilters = (
    <>
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
    </>
  );
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
        draft && editingAllowed && !paused
          ? (p) => {
              if (draft.coordinates.length >= 500) {
                setError('Limite de 500 vértices por área.');
                return;
              }
              change('coordinates', [
                ...draft.coordinates,
                [p.longitude, p.latitude],
              ]);
            }
          : undefined
      }
      onVertexMove={draft && editingAllowed ? move : undefined}
      onAreaSelect={draft ? undefined : selectArea}
      focusRequest={focusRequest}
      onVertexInsert={
        draft && editingAllowed
          ? (index, point) => {
              if (draft.coordinates.length >= 500) {
                setError('Limite de 500 vértices por área.');
                return;
              }
              change('coordinates', [
                ...draft.coordinates.slice(0, index),
                [point.longitude, point.latitude],
                ...draft.coordinates.slice(index),
              ]);
            }
          : undefined
      }
      onDrawFinish={
        draft && editingAllowed && !paused && draft.coordinates.length >= 3
          ? complete
          : undefined
      }
      showLayers={panel === 'layers'}
      onLayersToggle={() =>
        setPanel((p) => (p === 'layers' ? 'none' : 'layers'))
      }
      layerControls={localLayerFilters}
      workspaceTools={
        <div
          className="map-tool-dock"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          <button
            type="button"
            aria-pressed={!draft || paused}
            onClick={() => {
              setPaused(true);
              setPanel('none');
            }}
            title="Mover o mapa sem adicionar pontos"
          >
            <MousePointer2 size={18} />
            <span>Navegar</span>
          </button>
          {writable && (
            <>
              <button
                type="button"
                disabled={!editingAllowed || !!draft}
                onClick={() => start('total')}
                title="Desenhar o perímetro do imóvel"
              >
                <Plus size={18} />
                <span>Área total</span>
              </button>
              <button
                type="button"
                disabled={!editingAllowed || !!draft || !totals.length}
                onClick={() => start('productive')}
                title={
                  totals.length
                    ? 'Desenhar um talhão dentro da área total'
                    : 'Desenhe e conclua a área total primeiro'
                }
              >
                <LandPlot size={18} />
                <span>Talhão / cultura</span>
              </button>
            </>
          )}
          <button
            type="button"
            aria-pressed={panel === 'areas' || panel === 'editor'}
            onClick={() =>
              setPanel((p) =>
                p === 'areas' || p === 'editor'
                  ? 'none'
                  : draft
                    ? 'editor'
                    : 'areas',
              )
            }
          >
            <Pencil size={18} />
            <span>Áreas e dados</span>
          </button>
          <button
            type="button"
            aria-pressed={panel === 'layers'}
            onClick={() =>
              setPanel((p) => (p === 'layers' ? 'none' : 'layers'))
            }
          >
            <Layers size={18} />
            <span>Camadas</span>
          </button>
          <button
            type="button"
            aria-pressed={panel === 'versions'}
            onClick={() => void history()}
          >
            <History size={18} />
            <span>Versões</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPanel('none');
              focusArea();
            }}
          >
            <Focus size={18} />
            <span>Enquadrar tudo</span>
          </button>
          <button
            type="button"
            aria-pressed={panel === 'help'}
            onClick={() => setPanel((p) => (p === 'help' ? 'none' : 'help'))}
          >
            <HelpCircle size={18} />
            <span>Como usar</span>
          </button>
        </div>
      }
      workspacePanel={
        panel !== 'none' && panel !== 'layers' ? (
          <aside
            className="map-workspace-panel"
            ref={drawer}
            tabIndex={-1}
            aria-label={
              panel === 'versions'
                ? 'Versões do mapa'
                : panel === 'help'
                  ? 'Ajuda do mapa'
                  : 'Áreas e dados'
            }
          >
            <header>
              <h3>
                {panel === 'versions'
                  ? 'Versões do mapa'
                  : panel === 'help'
                    ? 'Como mapear'
                    : draft
                      ? 'Dados do desenho'
                      : 'Áreas e dados'}
              </h3>
              <button
                type="button"
                aria-label="Fechar painel do mapa"
                onClick={() => setPanel('none')}
              >
                <PanelRightClose size={18} />
              </button>
            </header>
            <div className="map-workspace-panel-body">
              {panel === 'versions' ? (
                <MapVersions
                  versions={versions}
                  loading={versionsLoading}
                  error={versionsError}
                  propertyId={propertyId}
                  currentRevision={latestRevision.current}
                  shownRevision={revision}
                  locked={dirty || !!draft || busy || !ready || formMode}
                  lockMessage={
                    formMode
                      ? 'No cadastro, o histórico pode ser consultado e o KML baixado. Para abrir um mapa antigo, salve ou feche o cadastro e use Versões na ficha da propriedade.'
                      : dirty || draft
                        ? 'Há um desenho ou alterações não salvas. Conclua e salve, ou descarte as alterações antes de abrir outra versão.'
                        : ''
                  }
                  onRetry={() => void history()}
                  onView={viewMap}
                  onReturn={() => setPanel(draft ? 'editor' : 'none')}
                />
              ) : panel === 'help' ? (
                <ol className="map-help">
                  <li>
                    <strong>Localize o imóvel</strong>Busque o município e
                    escolha Mapa ou Satélite.
                  </li>
                  <li>
                    <strong>Desenhe a área total</strong>Clique nos vértices.
                    Clique no primeiro ponto ou em Concluir área para fechar.
                  </li>
                  <li>
                    <strong>Cadastre os talhões</strong>Escolha a área total,
                    informe cultura e safra e desenhe os limites produtivos.
                  </li>
                  <li>
                    <strong>Ajuste com facilidade</strong>Arraste os pontos. Use
                    os sinais + nas bordas para inserir vértices, ou Desfazer /
                    Refazer.
                  </li>
                  <li>
                    <strong>Salve e exporte</strong>
                    {formMode
                      ? 'Salve o cadastro para gravar as áreas.'
                      : 'Salvar mapeamento cria a versão. Depois, baixe o KML ou consulte o histórico em Versões.'}
                  </li>
                </ol>
              ) : draft ? (
                <>
                  {editorFields}
                  {coordinateTable}
                </>
              ) : (
                <>
                  <p>
                    Clique no contorno ou selecione a área para consultar seus
                    dados.
                  </p>
                  {features.length === 0 && (
                    <p className="map-panel-note">
                      Nenhuma área desenhada. Comece por “Área total”.
                    </p>
                  )}
                  {features.map((f) => (
                    <article
                      className={
                        'map-area-card ' + (active === f.id ? 'selected' : '')
                      }
                      key={f.id}
                    >
                      <button
                        type="button"
                        className="area-select"
                        onClick={() => {
                          setActive(f.id);
                          focusArea(f.id);
                        }}
                      >
                        <span className={'area-swatch ' + f.kind} />
                        <strong>{f.name}</strong>
                        <span>{ha(f.area_ha)}</span>
                      </button>
                      <p>
                        {f.kind === 'total'
                          ? 'Área total'
                          : (f.crop || 'Cultura pendente') +
                            ' · ' +
                            (f.season || 'Safra pendente')}
                        <br />
                        Matrícula: {f.registry || 'pendente'}
                      </p>
                      {active === f.id && (
                        <>
                          <p>
                            Cartório: {f.registry_office || 'pendente'}
                            <br />
                            Titular: {f.registry_holder || 'pendente'}
                            <br />
                            CAR: {f.car || 'não informado'}
                            <br />
                            SIGEF: {f.sigef || 'não informado'}
                          </p>
                          <div className="map-version-actions">
                            <button
                              type="button"
                              onClick={() => focusArea(f.id)}
                            >
                              <Focus size={15} /> Localizar
                            </button>
                            {editingAllowed && (
                              <>
                                <button type="button" onClick={() => edit(f)}>
                                  <Pencil size={15} /> Editar
                                </button>
                                <button type="button" onClick={() => remove(f)}>
                                  <Trash2 size={15} /> Remover
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                  {coordinateTable}
                </>
              )}
            </div>
          </aside>
        ) : null
      }
      workspaceStatus={
        <>
          {!ready && !error && <p role="status">Carregando mapeamento…</p>}
          {error && (
            <p role="alert" className="map-panel-error">
              {error}
              {!ready && (
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                  Tentar novamente
                </button>
              )}
            </p>
          )}
          {notice && !error && <p role="status">{notice}</p>}
          {historical && (
            <p>
              Consultando versão histórica {revision}.{' '}
              <button
                type="button"
                disabled={busy || !!draft || dirty}
                onClick={() => viewMap(latestRevision.current)}
              >
                Voltar à versão atual
              </button>
            </p>
          )}
          {draft && (
            <strong>
              {paused
                ? 'Desenho pausado — navegue pelo mapa.'
                : 'Clique para adicionar pontos; arraste para ajustar.'}{' '}
              · {draft.coordinates.length} vértices
            </strong>
          )}
        </>
      }
      workspaceActions={
        <div className="map-action-bar" aria-label="Ações do mapeamento">
          {draft ? (
            <>
              <button type="button" onClick={undo} disabled={!undoStack.length}>
                <Undo2 size={16} /> Desfazer
              </button>
              <button type="button" onClick={redo} disabled={!redoStack.length}>
                <Redo2 size={16} /> Refazer
              </button>
              <button type="button" onClick={() => setPaused((p) => !p)}>
                {paused ? 'Continuar desenho' : 'Pausar desenho'}
              </button>
              <button type="button" onClick={() => setPanel('editor')}>
                <Pencil size={16} /> Dados
              </button>
              <button
                type="button"
                className="map-primary"
                disabled={draft.coordinates.length < 3}
                onClick={complete}
              >
                <Check size={16} /> Concluir área
              </button>
              <button type="button" onClick={cancelDrawing}>
                <X size={16} /> Cancelar
              </button>
            </>
          ) : (
            <>
              <span className="map-save-state">
                {dirty
                  ? 'Alterações não salvas'
                  : revision
                    ? 'Versão ' + revision + ' salva'
                    : 'Nenhuma versão salva'}
              </span>
              {!formMode && writable && (
                <button
                  type="button"
                  className="map-primary"
                  disabled={
                    !dirty || busy || !ready || historical || editablePin
                  }
                  onClick={() => void save()}
                >
                  <Save size={16} />
                  {busy ? 'Salvando…' : 'Salvar mapeamento'}
                </button>
              )}
              {formMode && dirty && (
                <strong>Salve o cadastro para confirmar as áreas.</strong>
              )}
              {!formMode &&
                propertyId &&
                revision > 0 &&
                !dirty &&
                features.length > 0 && (
                  <a
                    href={
                      '/api/properties/' +
                      propertyId +
                      '/mapping/kml?revision=' +
                      revision
                    }
                  >
                    <Download size={16} /> Baixar KML
                  </a>
                )}
              {dirty && !busy && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Descartar alterações não salvas?')) {
                      setViewVersion('');
                      setAttempt((n) => n + 1);
                      setNotice('');
                    }
                  }}
                >
                  Descartar alterações
                </button>
              )}
            </>
          )}
        </div>
      }
    >
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
      {!features.length && ready && !draft && (
        <p className="producer-map-message">
          Use “Área total” para desenhar o perímetro; depois cadastre os talhões
          em “Talhão / cultura”. O pin localiza a propriedade, mas não define
          sua superfície.
        </p>
      )}
      {features.length > 0 && !filtered.length && (
        <p className="producer-map-message">
          Nenhuma área corresponde aos filtros.
        </p>
      )}
    </PropertyMap>
  );
}
