'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ClipboardCheck,
  Database,
  Download,
  FileSearch,
  FolderKanban,
  History,
  LandPlot,
  Map,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Settings,
  ShieldCheck,
  Tractor,
  Upload,
  UsersRound,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fields as financialFields } from '../server/analysis.mjs';
import {
  TechnicalShell,
  TechnicalSummary,
  TechnicalOverview,
} from './technical-workspace';

type Row = Record<string, any>;
type State = { producers: Row[]; properties: Row[]; requests: Row[] };
type Detail = {
  request: Row;
  documents: Row[];
  analyses: Row[];
  decisions: Row[];
  audit: Row[];
};
type Modal = {
  kind: 'producer' | 'property' | 'request' | 'user' | 'password';
  item?: Row;
} | null;
const fields = financialFields as Record<string, string>;
const money = (v: any) =>
  v == null
    ? 'Não informado'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(Number(v));
const num = (v: any, d = 2) =>
  v == null
    ? '—'
    : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });
const date = (v: any) => (v ? new Date(v).toLocaleString('pt-BR') : '—');
const roleNames: Record<string, string> = {
  admin: 'Administrador',
  analyst: 'Analista',
  viewer: 'Consulta',
};
const statusNames: Record<string, string> = {
  rascunho: 'Rascunho',
  dados_incompletos: 'Dados incompletos',
  analisada: 'Analisada',
  parecer_registrado: 'Parecer registrado',
  complementacao: 'Complementação',
  pending: 'Na fila',
  processing: 'Lendo documento',
  extracted: 'A conferir',
  reviewed: 'Conferido',
  failed: 'Leitura não concluída',
  favoravel: 'Favorável',
  desfavoravel: 'Desfavorável',
};
const nav = [
  ['Visão geral', FolderKanban],
  ['Solicitações', ClipboardCheck],
  ['Produtores', UsersRound],
  ['Propriedades', Building2],
  ['Documentos', FileSearch],
  ['Mapas', Map],
  ['Viabilidade', BarChart3],
  ['Comitê', Scale],
  ['Configurações', Settings],
] as const;
const sectionInfo: Record<string, string> = {
  'Visão geral': 'Sua carteira, com informações registradas e rastreáveis.',
  Produtores: 'Pessoas e empresas que compõem a carteira da unidade.',
  Propriedades: 'Áreas, posse e referências documentais do produtor.',
  Solicitações: 'Dados da operação e premissas para a análise.',
  Documentos: 'Originais preservados, leitura assistida e conferência humana.',
  Mapas: 'Localização e referências das propriedades da operação.',
  Viabilidade:
    'Capacidade de pagamento calculada a partir dos valores informados.',
  Comitê: 'Parecer humano vinculado à versão da análise.',
  Configurações: 'Acessos da unidade e histórico das operações.',
};

async function api(
  path: string,
  method = 'GET',
  value?: unknown,
  extra: Record<string, string> = {},
) {
  const raw = value instanceof File;
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(method !== 'GET'
        ? {
            'X-Credit-Request': '1',
            'Content-Type': raw
              ? 'application/octet-stream'
              : 'application/json',
          }
        : {}),
      ...extra,
    },
    body:
      method === 'GET'
        ? undefined
        : raw
          ? (value as File)
          : JSON.stringify(value ?? {}),
  });
  if (response.status === 401)
    throw Error(
      'Sua sessão precisa de autenticação. Recarregue a página e entre novamente.',
    );
  const body: any = await response.json();
  if (!response.ok) throw Error(body.error || 'Não foi possível concluir.');
  return body;
}
function Badge({ value }: { value: string }) {
  return (
    <span className={'r-badge r-badge-' + value}>
      {statusNames[value] || value}
    </span>
  );
}
function Btn({
  children,
  onClick,
  type = 'button',
  secondary = false,
  disabled = false,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  secondary?: boolean;
  disabled?: boolean;
  [key: string]: any;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={'r-btn' + (secondary ? ' r-btn-secondary' : '')}
      {...rest}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  name,
  value = '',
  type = 'text',
  required = false,
  help,
  wide = false,
  min,
  max,
  step,
  ...rest
}: {
  label: string;
  name: string;
  value?: any;
  type?: string;
  required?: boolean;
  help?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: string;
  [key: string]: any;
}) {
  return (
    <label className={'r-field' + (wide ? ' r-wide' : '')}>
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {type === 'textarea' ? (
        <textarea
          name={name}
          defaultValue={value ?? ''}
          required={required}
          rows={3}
          {...rest}
        />
      ) : (
        <input
          name={name}
          defaultValue={value ?? ''}
          required={required}
          type={type}
          min={min}
          max={max}
          step={step}
          {...rest}
        />
      )}{' '}
      {help && <small>{help}</small>}
    </label>
  );
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="r-empty">
      <FolderKanban size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="r-panel">
      <div className="r-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
function Metrics({
  items,
}: {
  items: { label: string; value: ReactNode; note: string }[];
}) {
  return (
    <div className="r-metrics">
      {items.map((x) => (
        <div key={x.label}>
          <span>{x.label}</span>
          <strong>{x.value}</strong>
          <small>{x.note}</small>
        </div>
      ))}
    </div>
  );
}
function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<
    string,
    string
  >;
}
const numeric = (s: string) =>
  s == null || s.trim() === '' ? null : Number(s);

export default function Operational() {
  const [me, setMe] = useState<Row | null>(null),
    [state, setState] = useState<State>({
      producers: [],
      properties: [],
      requests: [],
    }),
    [detail, setDetail] = useState<Detail | null>(null);
  const [active, setActive] = useState('Visão geral'),
    [selected, setSelected] = useState(''),
    [modal, setModal] = useState<Modal>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [propertyId, setPropertyId] = useState('');
  const [users, setUsers] = useState<Row[]>([]),
    [events, setEvents] = useState<Row[]>([]),
    [tab, setTab] = useState('Resumo'),
    [docId, setDocId] = useState(''),
    [analysisId, setAnalysisId] = useState('');
  const selection = useRef('');
  selection.current = selected;
  const write = !!me && me.role !== 'viewer';
  async function refresh(id = selection.current) {
    const s = await api('/state');
    setState(s);
    if (id) {
      const d = await api('/requests/' + id);
      if (selection.current === id) {
        setDetail(d);
      }
    }
  }
  useEffect(() => {
    let live = true;
    Promise.all([api('/me'), api('/state')])
      .then(([u, s]) => {
        if (live) {
          setMe(u);
          setState(s);
          if (s.requests.length) setSelected(s.requests[0].id);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetail(null);
    api('/requests/' + selected)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [selected]);
  const waiting = detail?.documents.some((d) =>
    ['pending', 'processing'].includes(d.status),
  );
  useEffect(() => {
    if (!selected || !waiting) return;
    const id = selected;
    const timer = setInterval(() => {
      api('/requests/' + id)
        .then((d) => {
          if (selection.current === id) setDetail(d);
        })
        .catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [selected, waiting]);
  useEffect(() => {
    if (active !== 'Configurações' || me?.role !== 'admin') return;
    Promise.all([api('/users'), api('/audit')])
      .then(([u, a]) => {
        setUsers(u);
        setEvents(a);
      })
      .catch((e) => setError(e.message));
  }, [active, me?.role]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function act(
    work: () => Promise<void>,
    success = 'Alteração salva no banco.',
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openRequest(id: string, next = 'Solicitações') {
    setSelected(id);
    setActive(next);
    setTab('Resumo');
    setDocId('');
    setAnalysisId('');
  }
  function go(label: string) {
    setActive(label);
    setSearch('');
  }
  async function saveModal(payload: Row) {
    const m = modal!;
    const route = {
      producer: '/producers',
      property: '/properties',
      request: '/requests',
      user: '/users',
      password: '/password',
    }[m.kind];
    await act(
      async () => {
        const result = await api(
          route + (m.item?.id ? '/' + m.item.id : ''),
          m.item?.id ? 'PUT' : 'POST',
          payload,
        );
        setModal(null);
        await refresh();
        if (m.kind === 'request') openRequest(result.id);
        if (m.kind === 'user') setUsers(await api('/users'));
      },
      m.kind === 'password'
        ? 'Senha alterada. Recarregue a página e autentique com a nova senha.'
        : 'Registro salvo no banco.',
    );
  }
  const req = detail?.request;
  const currentAnalysis =
    detail?.analyses.find((a) => a.id === analysisId) || detail?.analyses[0];
  const currentDoc =
    detail?.documents.find((d) => d.id === docId) || detail?.documents[0];
  const filtered = (rows: Row[], keys: string[]) =>
    rows.filter((r) =>
      keys.some((k) =>
        String(r[k] ?? '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    );
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError('O limite por arquivo é 10 MB.');
      return;
    }
    await act(async () => {
      const d = await api(
        '/requests/' + selected + '/documents',
        'POST',
        file,
        { 'X-File-Name': encodeURIComponent(file.name) },
      );
      setDocId(d.id);
      await refresh();
    }, 'Original salvo. A leitura será concluída em segundo plano.');
  }
  const requestSelector = (
    <label className="r-selector">
      <span>Solicitação em análise</span>
      <select
        value={selected}
        onChange={(e) => openRequest(e.target.value, active)}
      >
        <option value="">Selecione uma solicitação</option>
        {state.requests.map((r) => (
          <option key={r.id} value={r.id}>
            {r.producer_name} · {r.title}
          </option>
        ))}
      </select>
    </label>
  );
  const requestList = (rows: Row[]) => (
    <div className="r-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Solicitação / produtor</th>
            <th>Crédito solicitado</th>
            <th>Etapa</th>
            <th>Atualização</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <button
                  className="r-text-link"
                  onClick={() => openRequest(r.id)}
                >
                  {r.title}
                </button>
                <small>{r.producer_name}</small>
              </td>
              <td>{money(r.data.principal)}</td>
              <td>
                <Badge value={r.status} />
              </td>
              <td>{date(r.updated_at)}</td>
              <td>
                <button
                  className="r-icon-btn"
                  aria-label={'Abrir ' + r.title}
                  onClick={() => openRequest(r.id)}
                >
                  <ArrowRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  function openDossier() {
    setTab('Dossiê');
    go('Comitê');
  }
  function openStage(label: string) {
    if (label === 'Cadastro') {
      if (!write) {
        go('Solicitações');
        return;
      }
      setModal(
        req
          ? { kind: 'request', item: req }
          : { kind: state.producers.length ? 'request' : 'producer' },
      );
    } else if (label === 'Dossiê') openDossier();
    else go(label === 'Validação' ? 'Documentos' : label);
  }
  return (
    <TechnicalShell
      navigation={nav}
      active={active}
      onNavigate={go}
      me={me}
      requests={state.requests}
      selected={selected}
      onSelect={(id) => openRequest(id, active)}
      onNew={() =>
        setModal({ kind: state.producers.length ? 'request' : 'producer' })
      }
      hasProducers={!!state.producers.length}
      busy={busy || loading}
      onRefresh={() => act(() => refresh(), 'Dados atualizados.')}
    >
      <main className="workspace r-content">
        <TechnicalSummary
          detail={detail}
          properties={state.properties}
          onStage={openStage}
          onDossier={openDossier}
        />
        {!['Visão geral', 'Mapas'].includes(active) && (
          <div className="r-page-title">
            <div>
              <div className="r-eyebrow">CRÉDITO RURAL · C149</div>
              <h1>{active}</h1>
              <p>{sectionInfo[active]}</p>
            </div>
            {write && active === 'Produtores' && (
              <Btn onClick={() => setModal({ kind: 'producer' })}>
                <Plus size={17} />
                Novo produtor
              </Btn>
            )}
            {write && active === 'Propriedades' && (
              <Btn
                onClick={() => setModal({ kind: 'property' })}
                disabled={!state.producers.length}
              >
                <Plus size={17} />
                Nova propriedade
              </Btn>
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="r-alert r-error">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="r-alert r-success">
            <Check size={17} />
            {notice}
          </div>
        )}
        {loading ? (
          <div className="r-empty">
            <LoaderCircle className="r-spin" />
            <p>Consultando a carteira…</p>
          </div>
        ) : !me ? (
          <Empty
            title="Acesso indisponível"
            text="Recarregue a página para tentar novamente."
          />
        ) : (
          <>
            {['Visão geral', 'Mapas'].includes(active) && (
              <TechnicalOverview
                detail={detail}
                properties={selected && !detail ? [] : state.properties}
                selectedPropertyId={propertyId}
                onProperty={setPropertyId}
                onEditProperty={(property) =>
                  setModal({ kind: 'property', item: property })
                }
                onNavigate={go}
                onStart={() =>
                  setModal({
                    kind: state.producers.length ? 'property' : 'producer',
                  })
                }
                writable={write}
                hasProducers={!!state.producers.length}
                currentDoc={currentDoc}
                onDoc={setDocId}
              />
            )}
            {active === 'Visão geral' && (
              <Panel
                title="Carteira da unidade"
                subtitle="Totais dos cadastros da unidade"
                actions={
                  <button
                    className="r-text-link"
                    onClick={() => go('Solicitações')}
                  >
                    Todas as solicitações
                  </button>
                }
              >
                <Metrics
                  items={[
                    {
                      label: 'Produtores cadastrados',
                      value: state.producers.length,
                      note: 'Cadastros na unidade',
                    },
                    {
                      label: 'Área cadastrada',
                      value:
                        num(
                          state.properties.reduce(
                            (sum, p) => sum + Number(p.area_ha),
                            0,
                          ),
                        ) + ' ha',
                      note: state.properties.length + ' propriedades',
                    },
                    {
                      label: 'Crédito em solicitações',
                      value: money(
                        state.requests.reduce(
                          (sum, r) => sum + (r.data.principal || 0),
                          0,
                        ),
                      ),
                      note: 'Valores informados, sem concessão',
                    },
                    {
                      label: 'Pareceres registrados',
                      value: state.requests.filter(
                        (r) => r.status === 'parecer_registrado',
                      ).length,
                      note: 'Decisões humanas documentadas',
                    },
                  ]}
                />
              </Panel>
            )}
            {active === 'Produtores' && (
              <Panel
                title="Cadastro de produtores"
                subtitle={`${state.producers.length} registros na unidade`}
                actions={
                  <input
                    className="r-search"
                    placeholder="Buscar nome, CPF ou município"
                    aria-label="Buscar produtor"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                }
              >
                {state.producers.length ? (
                  <div className="r-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Produtor</th>
                          <th>CPF / CNPJ</th>
                          <th>Município</th>
                          <th>Contato</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered(state.producers, [
                          'name',
                          'document',
                          'municipality',
                        ]).map((p) => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.name}</b>
                              <small>
                                {
                                  state.properties.filter(
                                    (x) => x.producer_id === p.id,
                                  ).length
                                }{' '}
                                propriedades
                              </small>
                            </td>
                            <td>{p.document || 'Não informado'}</td>
                            <td>{p.municipality || '—'}</td>
                            <td>{p.phone || '—'}</td>
                            <td>
                              {write && (
                                <button
                                  className="r-text-link"
                                  onClick={() =>
                                    setModal({ kind: 'producer', item: p })
                                  }
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Nenhum produtor cadastrado"
                    text="Use Novo produtor para iniciar sua carteira."
                  />
                )}
              </Panel>
            )}
            {active === 'Propriedades' && (
              <>
                <Panel
                  title="Propriedades rurais"
                  subtitle="Informações cadastrais declaradas; documentos disponíveis nas solicitações."
                  actions={
                    <input
                      className="r-search"
                      placeholder="Buscar propriedade ou município"
                      aria-label="Buscar propriedade"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  }
                >
                  {state.properties.length ? (
                    <div className="r-property-grid">
                      {filtered(state.properties, [
                        'name',
                        'municipality',
                        'car',
                      ]).map((p) => (
                        <article className="r-property" key={p.id}>
                          <div className="r-row">
                            <Building2 size={23} />
                            <Badge value={p.tenure} />
                          </div>
                          <h3>{p.name}</h3>
                          <p>
                            {
                              state.producers.find(
                                (x) => x.id === p.producer_id,
                              )?.name
                            }
                          </p>
                          <dl>
                            <div>
                              <dt>Área</dt>
                              <dd>{num(p.area_ha)} ha</dd>
                            </div>
                            <div>
                              <dt>Município</dt>
                              <dd>{p.municipality}</dd>
                            </div>
                            <div>
                              <dt>CAR declarado</dt>
                              <dd>{p.car || 'Não informado'}</dd>
                            </div>
                            <div>
                              <dt>Matrícula / contrato</dt>
                              <dd>{p.registry || 'Não informado'}</dd>
                            </div>
                          </dl>
                          <div className="r-row">
                            {write && (
                              <button
                                className="r-text-link"
                                onClick={() =>
                                  setModal({ kind: 'property', item: p })
                                }
                              >
                                Editar cadastro
                              </button>
                            )}
                            {p.latitude != null && (
                              <a
                                className="r-text-link"
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  'https://www.google.com/maps?q=' +
                                  encodeURIComponent(
                                    p.latitude + ',' + p.longitude,
                                  )
                                }
                              >
                                Ver coordenada ↗
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Nenhuma propriedade cadastrada"
                      text={
                        state.producers.length
                          ? 'Cadastre área, posse e os vínculos documentais.'
                          : 'Cadastre o produtor para adicionar suas propriedades.'
                      }
                    />
                  )}
                </Panel>
                <div className="r-alert">
                  Coordenadas representam um ponto informado, não o perímetro do
                  imóvel. CAR e matrícula precisam de conferência documental.
                </div>
              </>
            )}
            {active === 'Solicitações' && !selected && (
              <Panel
                title="Todas as solicitações"
                actions={
                  <input
                    className="r-search"
                    placeholder="Buscar solicitação ou produtor"
                    aria-label="Buscar solicitação"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                }
              >
                {state.requests.length ? (
                  requestList(
                    filtered(state.requests, ['title', 'producer_name']),
                  )
                ) : (
                  <Empty
                    title="Nenhuma solicitação cadastrada"
                    text={
                      state.producers.length
                        ? 'Crie uma solicitação para reunir os dados e documentos da operação.'
                        : 'Cadastre primeiro um produtor na aba Produtores.'
                    }
                  />
                )}
              </Panel>
            )}
            {['Documentos', 'Viabilidade', 'Comitê'].includes(active) &&
              requestSelector}
            {active === 'Solicitações' && selected && (
              <>
                <button
                  className="r-text-link r-back"
                  onClick={() => setSelected('')}
                >
                  ← Todas as solicitações
                </button>
                {requestSelector}
              </>
            )}
            {['Solicitações', 'Documentos', 'Viabilidade', 'Comitê'].includes(
              active,
            ) &&
              selected &&
              !detail && (
                <div className="r-empty">
                  <LoaderCircle className="r-spin" />
                  <p>Carregando a solicitação…</p>
                </div>
              )}
            {['Documentos', 'Viabilidade', 'Comitê'].includes(active) &&
              !selected && (
                <Empty
                  title="Selecione uma solicitação"
                  text="Os documentos, cálculos e pareceres pertencem a uma operação específica."
                />
              )}
            {detail && req && active === 'Solicitações' && (
              <>
                <div className="r-request-banner">
                  <div>
                    <Badge value={req.status} />
                    <h2>{req.title}</h2>
                    <p>
                      {req.producer_name} · Revisão {req.revision} ·{' '}
                      {date(req.updated_at)}
                    </p>
                  </div>
                  {write && (
                    <Btn
                      secondary
                      onClick={() => setModal({ kind: 'request', item: req })}
                    >
                      <Save size={16} />
                      Editar dados
                    </Btn>
                  )}
                </div>
                <div className="r-tabs">
                  {['Resumo', 'Histórico'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={t === tab ? 'active' : ''}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {tab === 'Histórico' ? (
                  <AuditTable rows={detail.audit} />
                ) : (
                  <>
                    <Metrics
                      items={[
                        {
                          label: 'Crédito solicitado',
                          value: money(req.data.principal),
                          note: req.data.purpose || 'Finalidade não informada',
                        },
                        {
                          label: 'Prazo',
                          value: req.data.termMonths ? (
                            <>
                              {req.data.termMonths} <em>meses</em>
                            </>
                          ) : (
                            '—'
                          ),
                          note: 'Parcelas mensais · Price',
                        },
                        {
                          label: 'Taxa mensal',
                          value:
                            req.data.monthlyRate != null
                              ? num(req.data.monthlyRate, 4) + '%'
                              : '—',
                          note: 'Informada pelo analista',
                        },
                        {
                          label: 'Documentos conferidos',
                          value:
                            detail.documents.filter(
                              (d) => d.status === 'reviewed',
                            ).length +
                            '/' +
                            detail.documents.length,
                          note: 'Conferência humana',
                        },
                      ]}
                    />
                    <div className="r-two-col">
                      <Panel
                        title="Premissas financeiras"
                        subtitle={
                          'Período inicial: ' +
                          (req.data.periodStart || 'não informado')
                        }
                      >
                        <div className="r-info-list">
                          {Object.entries(fields).map(([key, label]) => (
                            <div key={key}>
                              <span>
                                {label}
                                <small>
                                  {req.data.sources?.[key] ||
                                    'Fonte não informada'}
                                </small>
                              </span>
                              <b>{formatField(key, req.data[key])}</b>
                            </div>
                          ))}
                        </div>
                      </Panel>
                      <div>
                        <Panel title="Propriedades vinculadas">
                          {state.properties
                            .filter((p) => req.property_ids.includes(p.id))
                            .map((p) => (
                              <div className="r-linked" key={p.id}>
                                <LandPlot size={21} />
                                <div>
                                  <b>{p.name}</b>
                                  <p>
                                    {num(p.area_ha)} ha · {p.tenure} ·{' '}
                                    {p.municipality}
                                  </p>
                                </div>
                              </div>
                            ))}
                          {!req.property_ids.length && (
                            <p className="r-footnote">
                              Nenhuma propriedade vinculada.
                            </p>
                          )}
                        </Panel>
                        <Panel title="Informações técnicas">
                          <div className="r-notes">
                            {[
                              ['history', 'Histórico produtivo'],
                              ['soil', 'Solo e referências de laudos'],
                              ['climate', 'Risco climático informado'],
                              ['notes', 'Observações'],
                            ].map(([key, label]) => (
                              <div key={key}>
                                <h3>{label}</h3>
                                <p>{req.data[key] || 'Não informado'}</p>
                              </div>
                            ))}
                          </div>
                        </Panel>
                      </div>
                    </div>
                    <div className="r-row r-next">
                      <Btn secondary onClick={() => go('Documentos')}>
                        <FileSearch size={17} />
                        Conferir documentos
                      </Btn>
                      <Btn onClick={() => go('Viabilidade')}>
                        <BarChart3 size={17} />
                        Abrir viabilidade
                      </Btn>
                    </div>
                  </>
                )}
              </>
            )}
            {detail && active === 'Documentos' && (
              <>
                <Panel
                  title="Documentos da solicitação"
                  subtitle="Até 10 MB por arquivo e 20 páginas por PDF. Leitura de texto e OCR em português."
                  actions={
                    write && (
                      <label className={'r-btn' + (busy ? ' r-disabled' : '')}>
                        <Upload size={16} />
                        {busy ? 'Enviando…' : 'Enviar documento'}
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.txt"
                          hidden
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )
                  }
                >
                  {detail.documents.length ? (
                    <div className="r-document-layout">
                      <div className="r-document-list">
                        {detail.documents.map((d) => (
                          <button
                            key={d.id}
                            onClick={() => setDocId(d.id)}
                            className={currentDoc?.id === d.id ? 'active' : ''}
                          >
                            <FileSearch size={19} />
                            <span>
                              <b>{d.name}</b>
                              <Badge value={d.status} />
                            </span>
                          </button>
                        ))}
                      </div>
                      {currentDoc && (
                        <DocumentReview
                          key={
                            currentDoc.id +
                            ':' +
                            (currentDoc.reviewed_at || currentDoc.status)
                          }
                          doc={currentDoc}
                          request={req!}
                          writable={write}
                          busy={busy}
                          save={(data) =>
                            act(async () => {
                              await api(
                                '/documents/' + currentDoc.id + '/review',
                                'POST',
                                data,
                              );
                              await refresh();
                            }, 'Conferência registrada. Os valores ainda precisam ser aplicados à solicitação.')
                          }
                          apply={(keys) =>
                            act(async () => {
                              await api(
                                '/documents/' + currentDoc.id + '/apply',
                                'POST',
                                { keys, revision: req!.revision },
                              );
                              await refresh();
                            }, 'Campos conferidos aplicados à solicitação, com a referência do documento.')
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <Empty
                      title="Adicione os documentos da operação"
                      text="Envie demonstrativos, propostas, laudos e documentos de cadastro. O original permanece disponível para download."
                    />
                  )}
                </Panel>
              </>
            )}
            {detail && active === 'Viabilidade' && (
              <>
                <div className="r-analysis-actions">
                  <p>
                    Use os dados salvos da solicitação. Cada cálculo cria uma
                    versão para consulta.
                  </p>
                  {write && (
                    <Btn
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          const a = await api(
                            '/requests/' + selected + '/analyze',
                            'POST',
                          );
                          setAnalysisId(a.id);
                          await refresh();
                        }, 'Análise calculada e registrada no histórico.')
                      }
                    >
                      <BarChart3 size={17} />
                      {busy ? 'Calculando…' : 'Calcular análise'}
                    </Btn>
                  )}
                </div>
                {detail.analyses.length > 0 && (
                  <label className="r-selector">
                    <span>Versão da análise</span>
                    <select
                      value={currentAnalysis?.id || ''}
                      onChange={(e) => setAnalysisId(e.target.value)}
                    >
                      {detail.analyses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {date(a.created_at)} · revisão {a.source_revision}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {currentAnalysis ? (
                  <>
                    <AnalysisView
                      analysis={currentAnalysis}
                      currentRevision={req!.revision}
                    />
                    <div className="r-row r-next">
                      <Btn
                        secondary
                        onClick={() => {
                          setTab('Dossiê');
                          go('Comitê');
                        }}
                      >
                        <Download size={17} />
                        Abrir dossiê para PDF
                      </Btn>
                      <Btn onClick={() => go('Comitê')}>
                        <Scale size={17} />
                        Registrar parecer
                      </Btn>
                    </div>
                  </>
                ) : (
                  <Empty
                    title="Nenhuma análise calculada"
                    text="Informe os dados financeiros na solicitação e clique em Calcular análise. Campos em branco serão apontados como pendências."
                  />
                )}
              </>
            )}
            {detail && req && active === 'Comitê' && (
              <>
                <div className="r-tabs">
                  {['Parecer', 'Dossiê'].map((t) => (
                    <button
                      key={t}
                      className={
                        (tab === 'Dossiê' ? t === 'Dossiê' : t === 'Parecer')
                          ? 'active'
                          : ''
                      }
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {tab === 'Dossiê' ? (
                  currentAnalysis ? (
                    <Dossier detail={detail} analysis={currentAnalysis} />
                  ) : (
                    <Empty
                      title="O dossiê precisa de uma análise"
                      text="Calcule a análise na aba Viabilidade, mesmo que ainda existam pendências."
                    />
                  )
                ) : (
                  <>
                    <Panel
                      title="Parecer do responsável"
                      subtitle="O sistema calcula indicadores. O responsável registra a decisão e sua justificativa."
                    >
                      {!detail.analyses.length ? (
                        <p className="r-footnote">
                          Execute a análise na aba Viabilidade para registrar um
                          parecer.
                        </p>
                      ) : (
                        <>
                          <div className="r-alert">
                            Análise de {date(detail.analyses[0].created_at)} ·
                            revisão {detail.analyses[0].source_revision}.
                            {detail.analyses[0].source_revision !== req.revision
                              ? ' Os dados mudaram. Calcule uma nova análise antes de registrar o parecer.'
                              : ''}
                          </div>
                          {me.role === 'admin' ? (
                            <form
                              className="r-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const v = values(e.currentTarget);
                                void act(async () => {
                                  await api(
                                    '/requests/' + selected + '/decision',
                                    'POST',
                                    {
                                      ...v,
                                      analysis_id: detail.analyses[0].id,
                                    },
                                  );
                                  await refresh();
                                }, 'Parecer registrado com responsável, data e versão da análise.');
                              }}
                            >
                              <label className="r-field">
                                <span>Parecer</span>
                                <select
                                  name="decision"
                                  required
                                  defaultValue="complementacao"
                                >
                                  <option value="complementacao">
                                    Solicitar complementação
                                  </option>
                                  <option value="favoravel">Favorável</option>
                                  <option value="desfavoravel">
                                    Desfavorável
                                  </option>
                                </select>
                              </label>
                              <Field
                                label="Justificativa e condições"
                                name="justification"
                                type="textarea"
                                required
                                minLength={30}
                                maxLength={5000}
                                help="Explique a decisão, as ressalvas e as condições. Mínimo de 30 caracteres."
                                wide
                              />
                              <div className="r-wide r-form-actions">
                                <Btn
                                  type="submit"
                                  disabled={
                                    busy ||
                                    detail.analyses[0].source_revision !==
                                      req.revision
                                  }
                                >
                                  <ClipboardCheck size={17} />
                                  Registrar parecer
                                </Btn>
                              </div>
                            </form>
                          ) : (
                            <p className="r-footnote">
                              Seu perfil permite consultar pareceres. Apenas o
                              administrador registra decisões.
                            </p>
                          )}
                          <p className="r-footnote">
                            Parecer favorável exige cálculo completo,
                            propriedade vinculada, fontes financeiras informadas
                            e todos os documentos conferidos. Não representa
                            liberação bancária de crédito.
                          </p>
                        </>
                      )}
                    </Panel>
                    <Panel title="Histórico de pareceres">
                      {detail.decisions.length ? (
                        <div className="r-decisions">
                          {detail.decisions.map((d) => (
                            <article key={d.id}>
                              <Badge value={d.decision} />
                              <p>{d.justification}</p>
                              <small>
                                {d.actor_name} · {date(d.created_at)} · análise{' '}
                                {d.analysis_id.slice(0, 8)}
                              </small>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="r-footnote">Nenhum parecer registrado.</p>
                      )}
                    </Panel>
                  </>
                )}
              </>
            )}
            {active === 'Configurações' && (
              <>
                <Panel
                  title="Meu acesso"
                  subtitle={`${me.name} · ${roleNames[me.role]}`}
                  actions={
                    <Btn
                      secondary
                      onClick={() => setModal({ kind: 'password' })}
                    >
                      Alterar minha senha
                    </Btn>
                  }
                >
                  <p className="r-footnote">
                    Os acessos pertencem a esta unidade. Administradores e
                    analistas trabalham na mesma carteira; usuários de consulta
                    têm acesso somente à leitura. O login é solicitado pelo
                    navegador.
                  </p>
                </Panel>
                {me.role === 'admin' && (
                  <>
                    <Panel
                      title="Usuários da unidade"
                      actions={
                        <Btn onClick={() => setModal({ kind: 'user' })}>
                          <Plus size={17} />
                          Novo usuário
                        </Btn>
                      }
                    >
                      <div className="r-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Nome</th>
                              <th>Usuário</th>
                              <th>Perfil</th>
                              <th>Estado</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((u) => (
                              <tr key={u.id}>
                                <td>{u.name}</td>
                                <td>{u.username}</td>
                                <td>{roleNames[u.role]}</td>
                                <td>{u.active ? 'Ativo' : 'Desativado'}</td>
                                <td>
                                  {u.id !== me.id && (
                                    <button
                                      className="r-text-link"
                                      disabled={busy}
                                      onClick={() =>
                                        act(async () => {
                                          await api('/users/' + u.id, 'PUT', {
                                            active: !u.active,
                                          });
                                          setUsers(await api('/users'));
                                        }, 'Acesso atualizado.')
                                      }
                                    >
                                      {u.active ? 'Desativar' : 'Reativar'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <Panel
                      title="Trilha de auditoria"
                      subtitle="Últimos 300 eventos da unidade."
                      actions={
                        <Btn
                          secondary
                          onClick={() =>
                            act(
                              async () => setEvents(await api('/audit')),
                              'Histórico atualizado.',
                            )
                          }
                        >
                          <RefreshCw size={15} />
                          Atualizar
                        </Btn>
                      }
                    >
                      <AuditTable rows={events} />
                    </Panel>
                  </>
                )}
              </>
            )}
          </>
        )}
        <footer className="r-footer">
          <span>CRÉDITO C149 · Operação real</span>
          <span>
            Dados declarados + conferência documental + parecer humano
          </span>
        </footer>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setModal(null);
            setError('');
          }
        }}
      >
        <DialogContent className="r-modal sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {modal?.item ? 'Editar' : 'Cadastrar'}{' '}
              {
                {
                  producer: 'produtor',
                  property: 'propriedade',
                  request: 'solicitação',
                  user: 'usuário',
                  password: 'nova senha',
                }[modal?.kind || 'producer']
              }
            </DialogTitle>
            <DialogDescription>
              Os campos com * são obrigatórios. As alterações são salvas no
              banco ao confirmar.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div role="alert" className="r-alert r-error">
              {error}
            </div>
          )}
          {modal && (
            <EditForm
              key={modal.kind + (modal.item?.id || 'new')}
              modal={modal}
              state={state}
              busy={busy}
              onSave={saveModal}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </TechnicalShell>
  );
}

function formatField(key: string, value: any) {
  if (value == null) return 'Não informado';
  return ['monthlyRate', 'stressRevenuePct', 'stressCostPct'].includes(key)
    ? num(value, 4) + '%'
    : key === 'termMonths'
      ? num(value) + ' meses'
      : money(value);
}
function EditForm({
  modal,
  state,
  busy,
  onSave,
  onCancel,
}: {
  modal: NonNullable<Modal>;
  state: State;
  busy: boolean;
  onSave: (p: Row) => Promise<void>;
  onCancel: () => void;
}) {
  const item = modal.item || {},
    [producer, setProducer] = useState(item.producer_id || ''),
    [section, setSection] = useState('Operação');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      v = values(form);
    let payload: Row = v;
    if (modal.kind === 'property')
      payload = {
        ...v,
        area_ha: numeric(v.area_ha),
        latitude: numeric(v.latitude),
        longitude: numeric(v.longitude),
      };
    if (modal.kind === 'request') {
      const data: Row = { sources: {} };
      for (const k of Object.keys(fields)) {
        data[k] = numeric(v[k]);
        data.sources[k] = v['source_' + k] || '';
      }
      for (const k of [
        'purpose',
        'periodStart',
        'history',
        'soil',
        'climate',
        'notes',
      ])
        data[k] = v[k] || '';
      payload = {
        title: v.title,
        producer_id: v.producer_id,
        revision: item.revision,
        property_ids: new FormData(form).getAll('property_ids'),
        data,
      };
    }
    void onSave(payload);
  };
  return (
    <form className="r-form r-edit-form" onSubmit={submit}>
      {modal.kind === 'producer' && (
        <>
          <Field
            label="Nome / razão social"
            name="name"
            value={item.name}
            required
            maxLength={200}
          />
          <Field
            label="CPF / CNPJ"
            name="document"
            value={item.document}
            help="Validação dos dígitos; não consulta situação cadastral."
            maxLength={20}
          />
          <Field
            label="Município / UF"
            name="municipality"
            value={item.municipality}
            maxLength={200}
          />
          <Field
            label="Telefone"
            name="phone"
            type="tel"
            value={item.phone}
            maxLength={40}
          />
          <Field
            label="Observações cadastrais"
            name="notes"
            type="textarea"
            value={item.notes}
            wide
            maxLength={5000}
          />
        </>
      )}
      {['property', 'request'].includes(modal.kind) && (
        <label className="r-field r-wide">
          <span>Produtor *</span>
          <select
            name="producer_id"
            required
            value={producer}
            onChange={(e) => setProducer(e.target.value)}
            disabled={!!item.id}
          >
            <option value="">Selecione o produtor</option>
            {state.producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {item.id && (
            <input type="hidden" name="producer_id" value={producer} />
          )}
        </label>
      )}
      {modal.kind === 'property' && (
        <>
          <Field
            label="Nome da propriedade"
            name="name"
            value={item.name}
            required
            maxLength={200}
          />
          <Field
            label="Município / UF"
            name="municipality"
            value={item.municipality}
            required
            maxLength={200}
          />
          <Field
            label="Área total (ha)"
            name="area_ha"
            value={item.area_ha}
            type="number"
            min={0.001}
            step="any"
            required
          />
          <label className="r-field">
            <span>Posse *</span>
            <select name="tenure" defaultValue={item.tenure || 'Própria'}>
              {['Própria', 'Arrendada', 'Parceria', 'Outra'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <Field
            label="Registro CAR declarado"
            name="car"
            value={item.car}
            maxLength={200}
          />
          <Field
            label="Matrícula / contrato de posse"
            name="registry"
            value={item.registry}
            maxLength={200}
          />
          <Field
            label="Latitude (graus decimais)"
            name="latitude"
            value={item.latitude}
            type="number"
            min={-90}
            max={90}
            step="any"
            placeholder="Ex.: -28.4"
          />
          <Field
            label="Longitude (graus decimais)"
            name="longitude"
            value={item.longitude}
            type="number"
            min={-180}
            max={180}
            step="any"
            placeholder="Ex.: -54.9"
          />
          <Field
            label="Observações e referências"
            name="notes"
            value={item.notes}
            type="textarea"
            wide
            maxLength={5000}
          />
        </>
      )}
      {modal.kind === 'request' && (
        <>
          <div className="r-tabs r-wide">
            {['Operação', 'Financeiro', 'Informações técnicas'].map((s) => (
              <button
                key={s}
                type="button"
                className={section === s ? 'active' : ''}
                onClick={() => setSection(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div
            className="r-form r-wide"
            style={{ display: section === 'Operação' ? 'grid' : 'none' }}
          >
            <Field
              label="Título da solicitação"
              name="title"
              value={item.title}
              required={section === 'Operação'}
              maxLength={200}
              placeholder="Ex.: Custeio de soja · Safra 2026/27"
              wide
            />
            <Field
              label="Finalidade"
              name="purpose"
              value={item.data?.purpose}
              placeholder="Custeio, investimento, comercialização…"
              maxLength={5000}
            />
            <Field
              label="Início do período de análise (12 meses)"
              name="periodStart"
              type="date"
              value={item.data?.periodStart}
            />
            <fieldset className="r-wide r-checklist">
              <legend>Propriedades vinculadas</legend>
              {state.properties
                .filter((p) => p.producer_id === producer)
                .map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      name="property_ids"
                      value={p.id}
                      defaultChecked={item.property_ids?.includes(p.id)}
                    />
                    <span>
                      {p.name}
                      <small>
                        {num(p.area_ha)} ha · {p.tenure}
                      </small>
                    </span>
                  </label>
                ))}
              {!state.properties.some((p) => p.producer_id === producer) && (
                <p>
                  Nenhuma propriedade para este produtor. Cadastre na aba
                  Propriedades.
                </p>
              )}
            </fieldset>
          </div>
          <div
            className="r-wide"
            style={{ display: section === 'Financeiro' ? 'block' : 'none' }}
          >
            <div className="r-alert">
              Informe valores dos mesmos 12 meses. Use zero quando o valor for
              realmente zero. Campo vazio fica como pendência. O cálculo usa
              parcelas mensais Price, sem carência.
            </div>
            <div className="r-financial-form">
              {Object.entries(fields).map(([key, label]) => (
                <div className="r-financial-row" key={key}>
                  <Field
                    label={label}
                    name={key}
                    value={item.data?.[key]}
                    type="number"
                    min={
                      key === 'principal' ? 0.01 : key === 'termMonths' ? 1 : 0
                    }
                    max={
                      key === 'termMonths'
                        ? 360
                        : key === 'monthlyRate'
                          ? 20
                          : key === 'stressRevenuePct'
                            ? 100
                            : key === 'stressCostPct'
                              ? 300
                              : undefined
                    }
                    step={key === 'termMonths' ? '1' : 'any'}
                  />
                  <Field
                    label="Fonte / evidência do valor"
                    name={'source_' + key}
                    value={item.data?.sources?.[key]}
                    placeholder="Documento, página ou premissa justificada"
                    maxLength={500}
                  />
                </div>
              ))}
            </div>
          </div>
          <div
            className="r-form r-wide"
            style={{
              display: section === 'Informações técnicas' ? 'grid' : 'none',
            }}
          >
            <Field
              label="Histórico produtivo e fontes"
              name="history"
              type="textarea"
              value={item.data?.history}
              wide
              maxLength={5000}
              help="Safras, área, produtividade e evidências disponíveis."
            />
            <Field
              label="Solo e referências de laudos"
              name="soil"
              type="textarea"
              value={item.data?.soil}
              wide
              maxLength={5000}
            />
            <Field
              label="Riscos climáticos e fontes consultadas"
              name="climate"
              type="textarea"
              value={item.data?.climate}
              wide
              maxLength={5000}
              help="Sem consulta automática de dados meteorológicos nesta versão."
            />
            <Field
              label="Observações da análise"
              name="notes"
              type="textarea"
              value={item.data?.notes}
              wide
              maxLength={5000}
            />
          </div>
        </>
      )}
      {modal.kind === 'user' && (
        <>
          <Field label="Nome" name="name" required maxLength={200} />
          <Field
            label="Usuário de acesso"
            name="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[a-zA-Z0-9._\-]{3,50}"
            autoComplete="off"
          />
          <Field
            label="Senha inicial"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            help="Mínimo de 12 caracteres. Compartilhe diretamente com a pessoa."
          />
          <label className="r-field">
            <span>Perfil *</span>
            <select name="role" defaultValue="analyst">
              <option value="analyst">
                Analista · cadastros, leituras e cálculos
              </option>
              <option value="viewer">Consulta · somente leitura</option>
              <option value="admin">
                Administrador · inclui usuários e pareceres
              </option>
            </select>
          </label>
        </>
      )}
      {modal.kind === 'password' && (
        <Field
          label="Nova senha"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
          wide
          help="Mínimo de 12 caracteres. Depois de salvar, autentique novamente no navegador."
        />
      )}
      <div className="r-form-actions r-wide">
        <Btn secondary onClick={onCancel} disabled={busy}>
          Cancelar
        </Btn>
        <Btn type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle size={17} className="r-spin" />
          ) : (
            <Save size={17} />
          )}
          Salvar {modal.kind === 'password' ? 'senha' : 'cadastro'}
        </Btn>
      </div>
    </form>
  );
}

function DocumentReview({
  doc,
  request,
  writable,
  busy,
  save,
  apply,
}: {
  doc: Row;
  request: Row;
  writable: boolean;
  busy: boolean;
  save: (data: Row) => Promise<void>;
  apply: (keys: string[]) => Promise<void>;
}) {
  const [reviewValues, setReviewValues] = useState<Row>(
      doc.reviewed_fields || {},
    ),
    [importOpen, setImportOpen] = useState(false),
    [keys, setKeys] = useState<string[]>(
      Object.keys(doc.reviewed_fields || {}),
    );
  const canReview = ['extracted', 'reviewed', 'failed'].includes(doc.status);
  return (
    <div className="r-document-detail">
      <div className="r-row">
        <div>
          <h3>{doc.name}</h3>
          <small>
            {date(doc.created_at)} · <Badge value={doc.status} />
          </small>
        </div>
        <a
          className="r-btn r-btn-secondary"
          href={'/api/documents/' + doc.id + '/download'}
        >
          <Download size={15} />
          Original
        </a>
      </div>
      <p className="r-hash">SHA-256: {doc.sha256}</p>
      {['pending', 'processing'].includes(doc.status) ? (
        <div className="r-empty">
          <LoaderCircle className="r-spin" />
          <h3>Leitura em andamento</h3>
          <p>O original já está salvo. Você pode navegar e voltar depois.</p>
        </div>
      ) : (
        <>
          {doc.error && (
            <div className="r-alert">
              A leitura automática não foi concluída: {doc.error}
              <br />
              Você pode conferir o original e registrar os valores manualmente.
            </div>
          )}
          <label className="r-field">
            <span>Texto extraído · confira com o original</span>
            <textarea
              readOnly
              className="r-extracted"
              rows={12}
              value={
                doc.extracted_text ||
                'Sem texto extraído. Consulte o arquivo original.'
              }
            />
          </label>
          {doc.suggestions?.length > 0 && (
            <div className="r-suggestions">
              <h4>Campos localizados no texto</h4>
              <p>
                Reconhecimento por rótulos. Escolha uma sugestão para preencher
                a conferência; confirme período, unidade e separadores
                numéricos.
              </p>
              {doc.suggestions.map((s: Row, i: number) => (
                <div key={i}>
                  <span>
                    <b>{fields[s.key]}</b>
                    <small>
                      Página {s.page} · {s.snippet}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="r-text-link"
                    disabled={!writable || busy}
                    onClick={() =>
                      setReviewValues((v) => ({ ...v, [s.key]: s.value }))
                    }
                  >
                    Usar {formatField(s.key, s.value)}
                  </button>
                </div>
              ))}
            </div>
          )}
          {canReview && (
            <form
              className="r-review-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = values(e.currentTarget),
                  confirmed: Row = {};
                for (const k of Object.keys(fields))
                  if (
                    reviewValues[k] != null &&
                    String(reviewValues[k]).trim() !== ''
                  )
                    confirmed[k] = Number(reviewValues[k]);
                void save({ note: v.note, fields: confirmed });
              }}
            >
              <h4>Conferência humana</h4>
              <p>
                Registre apenas valores sustentados por este documento. Deixe os
                demais campos vazios.
              </p>
              <div className="r-form">
                {Object.entries(fields).map(([k, label]) => (
                  <label className="r-field" key={k}>
                    <span>{label}</span>
                    <input
                      type="number"
                      step={k === 'termMonths' ? '1' : 'any'}
                      min={0}
                      value={reviewValues[k] ?? ''}
                      disabled={!writable}
                      onChange={(e) =>
                        setReviewValues((v) => ({ ...v, [k]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <Field
                  label="O que foi conferido, período e ressalvas"
                  name="note"
                  value={doc.review_note}
                  type="textarea"
                  required
                  minLength={10}
                  maxLength={2000}
                  wide
                  disabled={!writable}
                />
              </div>
              {doc.reviewed_at && (
                <p className="r-footnote">
                  Última conferência: {date(doc.reviewed_at)}. Salvar uma nova
                  conferência invalida a análise anterior.
                </p>
              )}
              {writable && (
                <div className="r-form-actions">
                  <Btn type="submit" disabled={busy}>
                    <Check size={17} />
                    Registrar conferência
                  </Btn>
                </div>
              )}
            </form>
          )}
          {doc.status === 'reviewed' &&
            Object.keys(doc.reviewed_fields || {}).length > 0 &&
            writable && (
              <div className="r-import">
                <h4>Aplicar valores conferidos</h4>
                <p>
                  A aplicação usa a última conferência salva. Veja abaixo quais
                  valores da solicitação serão substituídos.
                </p>
                <Btn secondary onClick={() => setImportOpen(!importOpen)}>
                  Revisar aplicação de campos
                </Btn>
                {importOpen && (
                  <>
                    <div className="r-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Aplicar</th>
                            <th>Campo</th>
                            <th>Atual</th>
                            <th>Conferido</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(doc.reviewed_fields).map(
                            ([k, value]) => (
                              <tr key={k}>
                                <td>
                                  <input
                                    aria-label={'Aplicar ' + fields[k]}
                                    type="checkbox"
                                    checked={keys.includes(k)}
                                    onChange={(e) =>
                                      setKeys((v) =>
                                        e.target.checked
                                          ? [...v, k]
                                          : v.filter((x) => x !== k),
                                      )
                                    }
                                  />
                                </td>
                                <td>{fields[k]}</td>
                                <td>{formatField(k, request.data[k])}</td>
                                <td>{formatField(k, value)}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Btn
                      disabled={busy || !keys.length}
                      onClick={() => apply(keys)}
                    >
                      <Save size={16} />
                      Aplicar campos selecionados
                    </Btn>
                  </>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}

function AnalysisView({
  analysis,
  currentRevision,
}: {
  analysis: Row;
  currentRevision: number;
}) {
  const r = analysis.result;
  return (
    <div className="r-analysis">
      {analysis.source_revision !== currentRevision && (
        <div className="r-alert r-error">
          Análise desatualizada: dados da revisão {analysis.source_revision}. A
          solicitação está na revisão {currentRevision}. Calcule novamente para
          usar os dados atuais.
        </div>
      )}
      {r.missing.length > 0 && (
        <Panel
          title="Dados pendentes"
          subtitle="O cálculo completo depende destas informações."
        >
          <ul className="r-list">
            {r.missing.map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Panel>
      )}
      {r.status === 'calculated' && (
        <>
          <Metrics
            items={[
              {
                label: 'Parcela mensal estimada',
                value: money(r.installment),
                note: 'Price · sem carência',
              },
              {
                label: 'Cobertura das parcelas',
                value: num(r.base.coverage) + '×',
                note: 'Caixa disponível / dívida em 12 meses',
              },
              {
                label: 'Saldo após parcelas',
                value: money(r.base.balance),
                note: 'Cenário base · 12 meses',
              },
              {
                label: 'Saldo no cenário adverso',
                value: money(r.stress.balance),
                note: 'Premissas definidas na solicitação',
              },
            ]}
          />
          <Panel
            title="Capacidade de pagamento"
            subtitle="Comparação dos fluxos anuais declarados."
          >
            <div className="r-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Indicador · próximos 12 meses</th>
                    <th>Cenário base</th>
                    <th>Cenário adverso</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['revenue', 'Receita operacional'],
                    ['costs', 'Custos operacionais'],
                    ['available', 'Caixa disponível para parcelas'],
                    ['debtService', 'Parcelas existentes + novo crédito'],
                    ['coverage', 'Cobertura das parcelas'],
                    ['balance', 'Saldo após parcelas'],
                  ].map(([k, label]) => (
                    <tr key={k}>
                      <td>{label}</td>
                      <td>
                        {k === 'coverage'
                          ? num(r.base[k]) + '×'
                          : money(r.base[k])}
                      </td>
                      <td>
                        {k === 'coverage'
                          ? num(r.stress[k]) + '×'
                          : money(r.stress[k])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="r-conclusions">
              <p>
                <b>Base:</b> {r.conclusion}
              </p>
              <p>
                <b>Adverso:</b> {r.stressConclusion}
              </p>
            </div>
            <div className="r-info-list">
              <div>
                <span>Total das novas parcelas no prazo completo</span>
                <b>{money(r.totalNewPayments)}</b>
              </div>
              <div>
                <span>
                  Receita operacional para cobrir o caixa e as parcelas em 12
                  meses
                </span>
                <b>{money(r.breakEvenRevenue)}</b>
              </div>
              <div>
                <span>Garantias declaradas / principal solicitado</span>
                <b>
                  {r.collateralCoverage == null
                    ? 'Não informado'
                    : num(r.collateralCoverage) + '×'}
                </b>
              </div>
            </div>
          </Panel>
        </>
      )}
      <div className="r-two-col">
        <Panel title="Pendências e ressalvas">
          <ul className="r-list">
            {r.warnings.length ? (
              r.warnings.map((w: string) => <li key={w}>{w}</li>)
            ) : (
              <li>
                Nenhuma pendência de preenchimento detectada. A consistência dos
                documentos permanece sob responsabilidade do analista.
              </li>
            )}
          </ul>
        </Panel>
        <Panel title="Premissas e método">
          <ul className="r-list">
            {r.assumptions.map((a: string) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {r.formulas && (
            <details>
              <summary>Ver fórmulas utilizadas</summary>
              <dl className="r-formulas">
                {Object.entries(r.formulas).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {{
                        installment: 'Parcela',
                        available: 'Caixa disponível',
                        coverage: 'Cobertura',
                        balance: 'Saldo',
                      }[k] || k}
                    </dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <p className="r-footnote">
            Modelo: {r.model} · {date(analysis.created_at)} · análise{' '}
            {analysis.id.slice(0, 8)}
          </p>
        </Panel>
      </div>
    </div>
  );
}
function AuditTable({ rows }: { rows: Row[] }) {
  const actions: Record<string, string> = {
    create: 'Cadastro criado',
    update: 'Cadastro alterado',
    upload: 'Documento enviado',
    extract: 'Leitura concluída',
    review: 'Conferência registrada',
    apply_fields: 'Campos aplicados',
    analyze: 'Análise calculada',
    decision: 'Parecer registrado',
    password_changed: 'Senha alterada',
    access_changed: 'Acesso alterado',
  };
  return rows.length ? (
    <div className="r-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Responsável</th>
            <th>Ação</th>
            <th>Registro</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{date(a.created_at)}</td>
              <td>{a.actor_name || 'Sistema'}</td>
              <td>{actions[a.action] || a.action}</td>
              <td>{a.entity_id.slice(0, 8)}</td>
              <td>
                <details>
                  <summary>Ver</summary>
                  <pre className="r-audit-detail">
                    {JSON.stringify(a.detail, null, 2)}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="r-footnote">Nenhum evento registrado.</p>
  );
}
function Dossier({ detail, analysis }: { detail: Detail; analysis: Row }) {
  const snap = analysis.snapshot,
    req = snap.request,
    p = snap.producer;
  return (
    <>
      <div className="r-print-actions">
        <p>
          O PDF usa a versão da análise selecionada, com os dados e documentos
          daquela revisão.
        </p>
        <Btn onClick={() => window.print()}>
          <Download size={17} />
          Imprimir / salvar PDF
        </Btn>
      </div>
      <article className="r-dossier" id="dossier-print">
        <header>
          <span>CRÉDITO C149 · DOSSIÊ TÉCNICO</span>
          <h1>{req.title}</h1>
          <p>
            {p.name} · CPF/CNPJ: {p.document || 'não informado'}
          </p>
          <p>
            Análise {analysis.id} · {date(analysis.created_at)} · revisão{' '}
            {analysis.source_revision}
          </p>
        </header>
        <section>
          <h2>Cadastro e operação</h2>
          <dl>
            <div>
              <dt>Produtor / município</dt>
              <dd>
                {p.name} · {p.municipality || 'Não informado'}
              </dd>
            </div>
            <div>
              <dt>Finalidade</dt>
              <dd>{req.data.purpose || 'Não informada'}</dd>
            </div>
            <div>
              <dt>Início do período (12 meses)</dt>
              <dd>{req.data.periodStart || 'Não informado'}</dd>
            </div>
          </dl>
          <h3>Propriedades vinculadas</h3>
          {snap.properties.map((x: Row) => (
            <p key={x.id}>
              {x.name} · {num(x.area_ha)} ha · {x.tenure} · {x.municipality}
              <br />
              CAR: {x.car || 'não informado'} · Matrícula/contrato:{' '}
              {x.registry || 'não informado'}
            </p>
          ))}
        </section>
        <section>
          <h2>Valores e fontes da análise</h2>
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Valor</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(fields).map(([k, label]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td>{formatField(k, req.data[k])}</td>
                  <td>{req.data.sources?.[k] || 'Não informada'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Informações técnicas declaradas</h2>
          {[
            ['history', 'Histórico produtivo'],
            ['soil', 'Solo'],
            ['climate', 'Clima'],
            ['notes', 'Observações'],
          ].map(([k, label]) => (
            <div key={k}>
              <h3>{label}</h3>
              <p>{req.data[k] || 'Não informado'}</p>
            </div>
          ))}
          <p>
            CAR, SIGEF, séries climáticas e mapas de solo: sem integração
            automática nesta versão.
          </p>
        </section>
        <section>
          <h2>Análise financeira</h2>
          <AnalysisView
            analysis={analysis}
            currentRevision={detail.request.revision}
          />
        </section>
        <section>
          <h2>Documentos da revisão</h2>
          {snap.documents.map((d: Row) => (
            <div className="r-dossier-document" key={d.id}>
              <b>{d.name}</b>
              <p>
                {statusNames[d.status] || d.status} · Conferência:{' '}
                {date(d.reviewed_at)}
              </p>
              <small>SHA-256: {d.sha256}</small>
            </div>
          ))}
          {!snap.documents.length && <p>Nenhum documento nesta revisão.</p>}
        </section>
        <section>
          <h2>Pareceres vinculados a esta análise</h2>
          {detail.decisions
            .filter((d) => d.analysis_id === analysis.id)
            .map((d) => (
              <div key={d.id}>
                <h3>{statusNames[d.decision]}</h3>
                <p>{d.justification}</p>
                <p>
                  {d.actor_name} · {date(d.created_at)}
                </p>
              </div>
            ))}
          {!detail.decisions.some((d) => d.analysis_id === analysis.id) && (
            <p>Sem parecer humano registrado para esta análise.</p>
          )}
        </section>
        <footer>
          Relatório de apoio técnico. Valores declarados e documentos conferidos
          pelo responsável. Não constitui aprovação automática ou liberação de
          crédito.
        </footer>
      </article>
    </>
  );
}
