'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { PropertyMap, pointOf, type Point } from './property-map';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  FileCheck2,
  FileSearch,
  Gauge,
  LandPlot,
  Layers3,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { required } from '../server/analysis.mjs';

// Presentation consumes the existing API records. It never writes a record or generates a score.
type RecordData = Record<string, any>;
type Detail = {
  request: RecordData;
  documents: RecordData[];
  analyses: RecordData[];
  decisions: RecordData[];
};
const number = (value: unknown, digits = 2) =>
  value == null
    ? '—'
    : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits });
const money = (value: unknown) =>
  value == null
    ? 'Não informado'
    : Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
const date = (value: string) => new Date(value).toLocaleString('pt-BR');
const roles: Record<string, string> = {
  admin: 'Administrador',
  analyst: 'Analista de crédito',
  viewer: 'Consulta',
};
const statuses: Record<string, string> = {
  rascunho: 'Rascunho',
  dados_incompletos: 'Dados incompletos',
  analisada: 'Analisada',
  parecer_registrado: 'Parecer registrado',
  complementacao: 'Complementação',
  pending: 'Na fila de leitura',
  processing: 'Leitura em andamento',
  extracted: 'Aguardando conferência',
  reviewed: 'Conferido',
  failed: 'Conferência manual necessária',
};

export function TechnicalShell({
  children,
  navigation,
  active,
  onNavigate,
  me,
  requests,
  selected,
  onSelect,
  onNew,
  hasProducers,
  busy,
  onRefresh,
}: {
  children: ReactNode;
  navigation: readonly (readonly [string, any])[];
  active: string;
  onNavigate: (label: string) => void;
  me: RecordData | null;
  requests: RecordData[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  hasProducers: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <SidebarProvider
      defaultOpen={false}
      className="real-app technical-app"
      style={
        {
          '--sidebar-width': '14.5rem',
          '--sidebar-width-icon': '3.75rem',
        } as CSSProperties
      }
    >
      <TechnicalNavigation
        navigation={navigation}
        active={active}
        onNavigate={onNavigate}
      />
      <SidebarInset className="app-shell r-main">
        <header className="topbar">
          <div className="title-cluster">
            <SidebarTrigger aria-label="Alternar menu">
              <Menu />
            </SidebarTrigger>
            <div>
              <h1>Dossiê Técnico de Crédito</h1>
              <div className="technical-context">
                <span>Unidade São Luiz Gonzaga–RS</span>
                <select
                  aria-label="Solicitação em análise"
                  value={selected}
                  onChange={(e) => onSelect(e.target.value)}
                  disabled={!requests.length}
                >
                  <option value="">
                    {requests.length
                      ? 'Selecionar operação'
                      : 'Nenhuma solicitação cadastrada'}
                  </option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.producer_name} · {r.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="demo-chip operational-chip">OPERAÇÃO REAL</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar dados"
              disabled={busy}
              onClick={onRefresh}
            >
              <RefreshCw />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" className="profile-button" />}
              >
                <UserRound />
                <span>
                  <small>Perfil ativo</small>
                  {roles[me?.role || ''] || 'Carregando'}
                </span>
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {me?.name || 'Acesso autenticado'}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onNavigate('Configurações')}>
                    Meu acesso e configurações
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = '/?demo=1';
                  }}
                >
                  Consultar apresentação original
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {me?.role !== 'viewer' && (
              <Button
                className="primary-action"
                onClick={onNew}
                disabled={!me || busy}
              >
                <Plus />
                {hasProducers ? 'Nova solicitação' : 'Novo produtor'}
              </Button>
            )}
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
function TechnicalNavigation({
  navigation,
  active,
  onNavigate,
}: {
  navigation: readonly (readonly [string, any])[];
  active: string;
  onNavigate: (label: string) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  function go(label: string) {
    onNavigate(label);
    if (isMobile) setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon" variant="sidebar" className="technical-sidebar">
      <SidebarHeader className="brand-block">
        <div className="brand-mark">
          <LandPlot size={20} />
        </div>
        <div className="brand-copy">
          <strong>Dossiê Rural</strong>
          <span>Análise técnica</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map(([label, Icon]) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton
                    tooltip={label}
                    isActive={active === label}
                    onClick={() => go(label)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Dados da unidade · acesso autenticado"
              onClick={() => go('Configurações')}
            >
              <ShieldCheck />
              <span>Dados da unidade</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
export function TechnicalSummary({
  detail,
  properties,
  onStage,
  onDossier,
}: {
  detail: Detail | null;
  properties: RecordData[];
  onStage: (stage: string) => void;
  onDossier: () => void;
}) {
  const request = detail?.request,
    documents = detail?.documents || [],
    analysis = detail?.analyses[0];
  const fresh = !!analysis && analysis.source_revision === request?.revision;
  const calculated = fresh && analysis.result.status === 'calculated';
  const reviewed =
    documents.length > 0 && documents.every((d) => d.status === 'reviewed');
  const decided =
    fresh && detail?.decisions.some((d) => d.analysis_id === analysis.id);
  const steps = [
    {
      label: 'Cadastro',
      status: request
        ? request.property_ids.length
          ? 'concluída'
          : 'em andamento'
        : 'pendente',
    },
    {
      label: 'Documentos',
      status: documents.length ? 'concluída' : 'pendente',
    },
    {
      label: 'Validação',
      status: reviewed
        ? 'concluída'
        : documents.length
          ? 'com ressalva'
          : 'pendente',
    },
    {
      label: 'Viabilidade',
      status: calculated ? 'concluída' : analysis ? 'com ressalva' : 'pendente',
    },
    { label: 'Dossiê', status: analysis ? 'disponível' : 'pendente' },
    {
      label: 'Comitê',
      status: decided
        ? 'registrado'
        : calculated
          ? 'aguardando parecer'
          : 'pendente',
    },
  ];
  const area = request
    ? properties
        .filter((p) => request.property_ids.includes(p.id))
        .reduce((sum, p) => sum + Number(p.area_ha), 0)
    : null;
  return (
    <>
      <section className="process-strip" aria-label="Etapas da análise">
        {steps.map(({ label, status }, index) => (
          <button
            key={label}
            className={'stage stage-' + status.replaceAll(' ', '-')}
            onClick={() => onStage(label)}
          >
            <span className="stage-index">
              {['concluída', 'registrado'].includes(status) ? (
                <Check size={14} />
              ) : (
                index + 1
              )}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{status}</small>
            </span>
          </button>
        ))}
      </section>
      <section className="summary-line" aria-label="Resumo da operação">
        <div>
          <span>Limite solicitado</span>
          <strong>{money(request?.data.principal)}</strong>
        </div>
        <div>
          <span>Área explorada</span>
          <strong>{area == null ? '—' : number(area) + ' ha'}</strong>
        </div>
        <div>
          <span>Cobertura das parcelas</span>
          <strong>
            {calculated
              ? number(analysis.result.base.coverage) + '×'
              : 'Não calculada'}
          </strong>
        </div>
        <div>
          <span>Situação da análise</span>
          <strong className={request && !calculated ? 'amber-text' : ''}>
            {request
              ? statuses[request.status] || request.status
              : 'Aguardando cadastro'}
          </strong>
        </div>
        <Button
          className="dossier-button"
          onClick={onDossier}
          disabled={!analysis}
        >
          <FileCheck2 />
          Gerar dossiê
        </Button>
      </section>
    </>
  );
}

export function TechnicalOverview({
  detail,
  properties,
  selectedPropertyId,
  onProperty,
  onEditProperty,
  onSaveLocation,
  onNavigate,
  onStart,
  writable,
  hasProducers,
  currentDoc,
  onDoc,
}: {
  detail: Detail | null;
  properties: RecordData[];
  selectedPropertyId: string;
  onProperty: (id: string) => void;
  onEditProperty: (property: RecordData) => void;
  onSaveLocation: (property: RecordData, point: Point) => Promise<void>;
  onNavigate: (section: string) => void;
  onStart: () => void;
  writable: boolean;
  hasProducers: boolean;
  currentDoc?: RecordData;
  onDoc: (id: string) => void;
}) {
  const request = detail?.request;
  const linked = properties;
  const selected = linked.find((p) => p.id === selectedPropertyId) || linked[0];
  return (
    <>
      <section className="technical-grid">
        <TechnicalMap
          key={selected?.id || 'empty-map'}
          properties={linked}
          selected={selected}
          onSelect={onProperty}
          onEdit={onEditProperty}
          onSaveLocation={onSaveLocation}
          onStart={onStart}
          writable={writable}
          hasProducers={hasProducers}
        />
        <PropertyDetails
          selected={selected}
          properties={linked}
          onEdit={onEditProperty}
          writable={writable}
        />
      </section>
      <section className="evidence-grid">
        <DocumentEvidence
          documents={detail?.documents || []}
          document={currentDoc}
          onSelect={onDoc}
          onOpen={() => onNavigate('Documentos')}
        />
        <ViabilityCard
          detail={detail}
          onOpen={() => onNavigate('Viabilidade')}
        />
      </section>
    </>
  );
}
function satelliteUrl(lat: number, lng: number) {
  return (
    'https://www.google.com/maps/@?' +
    new URLSearchParams({
      api: '1',
      map_action: 'map',
      center: lat + ',' + lng,
      zoom: '16',
      basemap: 'satellite',
    }).toString()
  );
}
function TechnicalMap({
  properties,
  selected,
  onSelect,
  onEdit,
  onStart,
  onSaveLocation,
  writable,
  hasProducers,
}: {
  properties: RecordData[];
  selected?: RecordData;
  onSelect: (id: string) => void;
  onEdit: (property: RecordData) => void;
  onStart: () => void;
  onSaveLocation: (property: RecordData, point: Point) => Promise<void>;
  writable: boolean;
  hasProducers: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Point | null>(null);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const point = pointOf(selected);
  async function save() {
    if (!selected || !draft || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSaveLocation(selected, draft);
      setEditing(false);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="panel map-panel">
      <header className="panel-header">
        <div>
          <h2>Mapa das propriedades do produtor</h2>
          <p>
            {selected
              ? selected.name + ' · ' + selected.municipality
              : 'Cadastre uma propriedade para marcar a localização'}
          </p>
        </div>
        <div className="producer-screen-actions">
          {point && (
            <a
              className="technical-source-link"
              href={satelliteUrl(point.latitude, point.longitude)}
              target="_blank"
              rel="noreferrer"
            >
              <Layers3 size={15} />
              Satélite
            </a>
          )}
          {selected && writable && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setDraft(point);
              }}
            >
              <MapPin size={15} />
              {point ? 'Ajustar pin' : 'Marcar localização'}
            </button>
          )}
          {!selected && writable && (
            <button type="button" onClick={onStart}>
              <Plus size={15} />
              {hasProducers ? 'Cadastrar propriedade' : 'Cadastrar produtor'}
            </button>
          )}
        </div>
      </header>
      <PropertyMap
        properties={properties}
        selectedId={selected?.id}
        municipality={selected?.municipality}
        editable={editing && !saving}
        onPick={setDraft}
        onSelect={editing ? undefined : onSelect}
        draft={draft}
      />
      {editing && (
        <div className="producer-map-save producer-screen-actions">
          <span>
            {draft
              ? `Pin escolhido: ${draft.latitude.toFixed(6)}, ${draft.longitude.toFixed(6)}`
              : 'Clique no mapa para escolher o ponto.'}
          </span>
          <button
            type="button"
            className="r-btn"
            disabled={!draft || saving}
            onClick={save}
          >
            {saving ? 'Salvando…' : 'Salvar localização'}
          </button>
          <button
            type="button"
            className="r-btn r-btn-secondary"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setDraft(null);
              setError('');
            }}
          >
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p className="producer-map-message" role="alert">
          {error}
        </p>
      )}
      {properties.length > 0 && (
        <div
          className="technical-property-picker producer-screen-actions"
          aria-label="Propriedades do produtor"
        >
          {properties.map((p) => (
            <button
              key={p.id}
              disabled={editing}
              className={p.id === selected?.id ? 'active' : ''}
              onClick={() => onSelect(p.id)}
            >
              <LandPlot size={15} />
              <span>
                {p.name}
                <small>
                  {number(p.area_ha)} ha declarados · {p.tenure}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && writable && (
        <button
          type="button"
          className="text-action producer-screen-actions"
          onClick={() => onEdit(selected)}
        >
          Editar cadastro completo e localização
        </button>
      )}
    </article>
  );
}
function PropertyDetails({
  selected,
  properties,
  onEdit,
  writable,
}: {
  selected?: RecordData;
  properties: RecordData[];
  onEdit: (property: RecordData) => void;
  writable: boolean;
}) {
  const total = properties.reduce((sum, p) => sum + Number(p.area_ha), 0);
  const own = properties
    .filter((p) => p.tenure === 'Própria')
    .reduce((sum, p) => sum + Number(p.area_ha), 0);
  const leased = properties
    .filter((p) => p.tenure === 'Arrendada')
    .reduce((sum, p) => sum + Number(p.area_ha), 0);
  return (
    <aside className="panel plot-panel">
      <header className="panel-header">
        <div>
          <h2>Área selecionada</h2>
          <p>
            {selected
              ? 'Cadastro atualizado em ' + date(selected.updated_at)
              : 'Informações do cadastro'}
          </p>
        </div>
        <Gauge size={20} />
      </header>
      <div className="plot-heading">
        <span
          style={{
            background:
              selected?.tenure === 'Arrendada' ? '#e1a92d' : '#3eab75',
          }}
        />
        <div>
          <small>PROPRIEDADE</small>
          <strong>{selected?.name || 'Nenhuma selecionada'}</strong>
        </div>
      </div>
      <dl className="detail-list">
        {[
          ['Área declarada', selected ? number(selected.area_ha) + ' ha' : '—'],
          ['Posse', selected?.tenure || '—'],
          ['Município', selected?.municipality || '—'],
          ['CAR', selected?.car || 'Não informado'],
          ['Matrícula / contrato', selected?.registry || 'Não informado'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="warning-box">
        <AlertTriangle />
        <div>
          <strong>Conferência documental</strong>
          <p>
            CAR, matrícula e área são dados declarados. O cruzamento de
            perímetros ainda não está conectado.
          </p>
        </div>
      </div>
      <div className="mini-bars">
        {[
          ['Área própria', own],
          ['Área arrendada', leased],
        ].map(([label, value], i) => (
          <div className="technical-land-row" key={label}>
            <div>
              <span>{label}</span>
              <b>{number(value)} ha</b>
            </div>
            <i>
              <em
                className={i ? 'leased-bar' : ''}
                style={{
                  width: total ? (Number(value) / total) * 100 + '%' : '0%',
                }}
              />
            </i>
          </div>
        ))}
      </div>
      {selected && writable && (
        <button className="text-action" onClick={() => onEdit(selected)}>
          Editar cadastro da propriedade
        </button>
      )}
    </aside>
  );
}
function DocumentEvidence({
  documents,
  document,
  onSelect,
  onOpen,
}: {
  documents: RecordData[];
  document?: RecordData;
  onSelect: (id: string) => void;
  onOpen: () => void;
}) {
  const suggestions =
    document?.status === 'reviewed'
      ? Object.entries(document.reviewed_fields || {}).map(([key, value]) => ({
          key,
          value,
        }))
      : document?.suggestions || [];
  const labels: Record<string, string> = {
    revenue: 'Receita operacional',
    principal: 'Crédito solicitado',
    monthlyRate: 'Taxa mensal',
    termMonths: 'Prazo',
    operatingCosts: 'Custos operacionais',
    otherIncome: 'Outras entradas',
    householdCosts: 'Retiradas familiares',
    existingDebtService: 'Parcelas existentes',
    collateral: 'Garantias declaradas',
  };
  return (
    <article className="panel document-panel">
      <header className="panel-header">
        <div>
          <h2>Evidência documental</h2>
          <p>
            {document ? document.name : 'Documentos da solicitação selecionada'}
          </p>
        </div>
        <button onClick={onOpen}>
          <FileSearch size={15} />
          {document ? 'Conferir documento' : 'Enviar documentos'}
        </button>
      </header>
      <div className="document-body">
        <div className="thumbs">
          {documents.slice(0, 6).map((d, index) => (
            <button
              key={d.id}
              className={d.id === document?.id ? 'active' : ''}
              title={d.name}
              aria-label={'Selecionar documento ' + d.name}
              onClick={() => onSelect(d.id)}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="paper technical-evidence-paper">
          {document ? (
            <>
              <small>{statuses[document.status] || document.status}</small>
              <h3>{document.name}</h3>
              <p>
                {document.extracted_text
                  ? document.extracted_text.slice(0, 1600)
                  : ['pending', 'processing'].includes(document.status)
                    ? 'Leitura em andamento. O original já está salvo.'
                    : 'Abra o original para conferir o documento.'}
              </p>
            </>
          ) : (
            <div className="technical-evidence-empty">
              <FileSearch size={28} />
              <h3>Nenhum documento selecionado</h3>
              <p>
                Envie o arquivo na aba Documentos para visualizar a leitura e
                conferir os valores.
              </p>
            </div>
          )}
        </div>
        <div className="extracted">
          <h3>
            {document?.status === 'reviewed'
              ? 'Valores conferidos'
              : 'Dados extraídos'}
          </h3>
          {suggestions.slice(0, 4).map((s: RecordData, index: number) => (
            <button key={index} onClick={onOpen}>
              <span>{labels[s.key] || s.key}</span>
              <strong>
                {s.key === 'monthlyRate'
                  ? number(s.value) + '%'
                  : s.key === 'termMonths'
                    ? number(s.value) + ' meses'
                    : money(s.value)}
              </strong>
            </button>
          ))}
          {!suggestions.length && (
            <p>
              Os valores aparecerão após a leitura ou a conferência do
              documento.
            </p>
          )}
          {document && (
            <button onClick={onOpen}>
              <span>Situação</span>
              <strong>{statuses[document.status] || document.status}</strong>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function ViabilityCard({
  detail,
  onOpen,
}: {
  detail: Detail | null;
  onOpen: () => void;
}) {
  const data = detail?.request.data || {},
    analysis = detail?.analyses[0],
    fresh = !!analysis && analysis.source_revision === detail?.request.revision;
  const result =
    fresh && analysis.result.status === 'calculated' ? analysis.result : null;
  const docs = detail?.documents || [],
    confirmed = docs.filter((d) => d.status === 'reviewed').length;
  const rows = [
    {
      label: 'Dados financeiros',
      value: required.filter((k) => typeof data[k] === 'number').length,
      total: required.length,
    },
    {
      label: 'Fontes informadas',
      value: required.filter((k) => data.sources?.[k]).length,
      total: required.length,
    },
    { label: 'Documentos conferidos', value: confirmed, total: docs.length },
  ];
  return (
    <aside className="panel score-panel">
      <header className="panel-header">
        <div>
          <h2>Viabilidade da operação</h2>
          <p>Indicadores calculados · decisão humana</p>
        </div>
        <span className="score-ring">
          {result ? number(result.base.coverage) + '×' : '—'}
        </span>
      </header>
      <div className="score-status">
        {result
          ? result.conclusion
          : analysis && !fresh
            ? 'Análise precisa ser atualizada'
            : 'Aguardando dados e cálculo'}
      </div>
      {rows.map((row) => (
        <div className="score-row" key={row.label}>
          <span>{row.label}</span>
          <i>
            <em
              style={{
                width: row.total ? (row.value / row.total) * 100 + '%' : '0%',
              }}
            />
          </i>
          <b>
            {row.value}/{row.total}
          </b>
        </div>
      ))}
      <div className="technical-payment">
        <span>Parcela mensal estimada</span>
        <strong>{result ? money(result.installment) : 'Não calculada'}</strong>
      </div>
      <button className="text-action" onClick={onOpen}>
        <BarChart3 size={15} />
        Abrir análise e cenários
      </button>
    </aside>
  );
}
