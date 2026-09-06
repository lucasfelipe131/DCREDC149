'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  FileText,
  Pencil,
  Printer,
  Plus,
  UserRound,
  MapPin,
} from 'lucide-react';
import { fields, required } from '../server/analysis.mjs';
import { pointOf } from './property-map';
import { MappingRecord } from './mapping-record';

type Row = Record<string, any>;
export type ProducerOverviewData = {
  producer: Row;
  properties: Row[];
  requests: Row[];
  documents: Row[];
  analyses: Row[];
  decisions: Row[];
  history: Row[];
  generated_at: string;
};
const number = (v: any) =>
  v == null
    ? 'Não informado'
    : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const money = (v: any) =>
  v == null
    ? 'Não informado'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v: any) =>
  v ? new Date(v).toLocaleString('pt-BR') : 'Não informado';
const stage: Record<string, string> = {
  rascunho: 'Rascunho',
  dados_incompletos: 'Dados incompletos',
  analisada: 'Análise calculada',
  parecer_registrado: 'Parecer registrado',
  complementacao: 'Complementação',
  reviewed: 'Conferido',
  pending: 'Na fila de leitura',
  processing: 'Leitura em andamento',
  extracted: 'Aguardando conferência',
  failed: 'Conferência manual necessária',
  favoravel: 'Favorável',
  desfavoravel: 'Desfavorável',
};

function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel producer-section">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="producer-screen-actions">{action}</div>
      </header>
      <div className="producer-section-body">{children}</div>
    </section>
  );
}
function Values({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="producer-values">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || 'Não informado'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProducerIdentity({
  producers,
  selectedId,
  producer,
  onSelect,
  onEdit,
  onCreate,
  ready,
  writable,
}: {
  producers: Row[];
  selectedId: string;
  producer?: Row;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onCreate: () => void;
  ready: boolean;
  writable: boolean;
}) {
  function print() {
    document.body.classList.add('printing-producer');
    window.addEventListener(
      'afterprint',
      () => document.body.classList.remove('printing-producer'),
      { once: true },
    );
    window.print();
  }
  return (
    <section className="panel producer-identity">
      <div className="producer-identity-title">
        <div className="producer-avatar">
          <UserRound size={25} />
        </div>
        <div>
          <p>VISÃO DO PRODUTOR · PREPARAÇÃO PARA O COMITÊ</p>
          <h1>{producer?.name || 'Selecione o produtor'}</h1>
          <span>
            {producer?.municipality || 'Município não informado'} · CPF/CNPJ:{' '}
            {producer?.document || 'Não informado'}
          </span>
        </div>
      </div>
      <div className="producer-identity-actions producer-screen-actions">
        <label>
          Produtor em análise
          <select
            aria-label="Produtor em análise"
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">Selecione o produtor</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {writable && (
          <button
            type="button"
            className="r-btn r-btn-secondary"
            onClick={onEdit}
            disabled={!producer}
          >
            <Pencil size={15} />
            Editar produtor
          </button>
        )}
        {writable && (
          <button
            type="button"
            className="r-btn r-btn-secondary"
            onClick={onCreate}
            disabled={!producer}
          >
            <Plus size={15} />
            Nova propriedade
          </button>
        )}
        <button
          type="button"
          className="r-btn"
          disabled={!ready}
          onClick={print}
        >
          <Printer size={15} />
          Ficha para o comitê
        </button>
      </div>
    </section>
  );
}

export function ProducerOverview({
  data,
  selectedRequestId,
  onRequest,
  onEditProperty,
  onEditProducer,
  onNewRequest,
  onNavigate,
  writable,
}: {
  data: ProducerOverviewData;
  selectedRequestId: string;
  onRequest: (id: string) => void;
  onEditProperty: (p: Row) => void;
  onEditProducer: () => void;
  onNewRequest: () => void;
  onNavigate: (section: string) => void;
  writable: boolean;
}) {
  const {
    producer,
    properties,
    requests,
    documents,
    analyses,
    decisions,
    history,
  } = data;
  const request = requests.find((r) => r.id === selectedRequestId);
  const latest = analyses.find((a) => a.request_id === request?.id);
  const fresh = !!latest && latest.source_revision === request?.revision;
  const result = fresh ? latest.result : null;
  const attention: {
    title: string;
    owner: string;
    action: () => void;
    button: string;
  }[] = [];
  if (!producer.document)
    attention.push({
      title: 'CPF/CNPJ não informado',
      owner: 'Cadastro do produtor',
      action: onEditProducer,
      button: 'Completar cadastro',
    });
  if (!properties.length)
    attention.push({
      title: 'Nenhuma propriedade cadastrada',
      owner: 'Levantamento do produtor',
      action: () => onNavigate('Propriedades'),
      button: 'Cadastrar propriedade',
    });
  for (const property of properties) {
    const missing = [
      !pointOf(property) && 'localização',
      !property.car &&
        !property.mapping?.features.some((f: Row) => f.car) &&
        'CAR',
      !property.registry &&
        !property.mapping?.features.some((f: Row) => f.registry) &&
        'matrícula/contrato',
      !property.mapping?.features.some((f: Row) => f.kind === 'total') &&
        'perímetro mapeado',
      !property.mapping?.features.some((f: Row) => f.kind === 'productive') &&
        'área produtiva mapeada',
      property.mapping?.features.some(
        (f: Row) => f.kind === 'productive' && (!f.crop || !f.season),
      ) && 'cultura/safra de talhão',
    ].filter(Boolean);
    if (missing.length)
      attention.push({
        title: `${property.name}: falta ${missing.join(', ')}`,
        owner: 'Cadastro e documentação do imóvel',
        action: () => onEditProperty(property),
        button: 'Completar propriedade',
      });
  }
  if (!requests.length)
    attention.push({
      title: 'Solicitação de crédito ainda não preparada',
      owner: 'Responsável pelo atendimento',
      action: onNewRequest,
      button: 'Preparar solicitação',
    });
  if (!documents.length)
    attention.push({
      title: 'Nenhum documento anexado às solicitações deste produtor',
      owner: 'Conferência documental',
      action: () =>
        requests.length ? onNavigate('Documentos') : onNewRequest(),
      button: requests.length ? 'Anexar documentos' : 'Preparar solicitação',
    });
  const unreviewed = documents.filter((d) => d.status !== 'reviewed');
  if (unreviewed.length)
    attention.push({
      title: `${unreviewed.length} documento(s) aguardando conferência`,
      owner: 'Analista responsável',
      action: () => {
        onRequest(unreviewed[0].request_id);
        onNavigate('Documentos');
      },
      button: 'Conferir documentos',
    });
  if (request) {
    const missing = required.filter((key) => request.data?.[key] == null);
    if (missing.length)
      attention.push({
        title: `${missing.length} campo(s) financeiro(s) ainda não informado(s) na solicitação selecionada`,
        owner: 'Responsável pela solicitação',
        action: () => onNavigate('Solicitações'),
        button: 'Completar solicitação',
      });
    if (!latest || !fresh)
      attention.push({
        title: latest
          ? 'Análise desatualizada após alteração dos dados'
          : 'Capacidade de pagamento ainda não calculada',
        owner: 'Revisão financeira',
        action: () => onNavigate('Viabilidade'),
        button: 'Abrir viabilidade',
      });
  }
  const total = properties.reduce((sum, p) => sum + Number(p.area_ha || 0), 0);
  return (
    <div className="producer-overview-content">
      <div className="producer-metrics">
        {[
          [
            'Propriedades cadastradas',
            String(properties.length),
            'Registros deste produtor',
          ],
          [
            'Área declarada',
            number(total) + ' ha',
            'Soma cadastral; não é área única medida',
          ],
          [
            'Propriedades localizadas',
            properties.filter((p) => pointOf(p)).length +
              ' / ' +
              properties.length,
            'Pontos salvos no cadastro',
          ],
          [
            'Documentos conferidos',
            documents.filter((d) => d.status === 'reviewed').length +
              ' / ' +
              documents.length,
            'Anexos das solicitações do produtor',
          ],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>

      <div className="producer-two-col">
        <Section
          title="Cadastro e relacionamento"
          subtitle={'Atualizado em ' + date(producer.updated_at)}
        >
          <Values
            rows={[
              ['Nome / razão social', producer.name],
              ['CPF/CNPJ', producer.document],
              ['Contato', producer.phone],
              ['Município', producer.municipality],
              ['Cadastro no sistema', date(producer.created_at)],
              ['Observações do atendimento', producer.notes],
            ]}
          />
        </Section>
        <Section
          title="Pendências para preparar a apresentação"
          subtitle="Lacunas cadastrais e documentais; não são critérios de concessão"
        >
          {attention.length ? (
            <ul className="producer-attention">
              {attention.map((p, i) => (
                <li key={i}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{p.title}</strong>
                    <small>{p.owner}</small>
                    {writable && (
                      <button
                        type="button"
                        className="r-text-link producer-screen-actions"
                        onClick={p.action}
                      >
                        {p.button}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              As verificações cadastrais disponíveis não encontraram lacunas. A
              avaliação do comitê permanece necessária.
            </p>
          )}
        </Section>
      </div>

      <Section
        title="Propriedades, localização e referências documentais"
        subtitle="Dados declarados no cadastro; matrícula e CAR ainda exigem conferência documental"
      >
        <div className="producer-property-cards">
          {properties.map((p) => {
            const point = pointOf(p);
            return (
              <article key={p.id}>
                <h3>{p.name}</h3>
                <Values
                  rows={[
                    ['Município', p.municipality],
                    ['Área declarada', number(p.area_ha) + ' ha'],
                    [
                      'Área total mapeada',
                      p.mapping
                        ? number(p.mapping.summary.total_ha) + ' ha'
                        : 'Pendente',
                    ],
                    [
                      'Área produtiva mapeada',
                      p.mapping
                        ? number(p.mapping.summary.productive_ha) + ' ha'
                        : 'Pendente',
                    ],
                    [
                      'Culturas / safras informadas',
                      p.mapping?.features
                        .filter((f: Row) => f.kind === 'productive')
                        .map(
                          (f: Row) =>
                            (f.crop || 'Cultura pendente') +
                            ' · ' +
                            (f.season || 'Safra pendente'),
                        )
                        .join('; ') || 'Não informadas',
                    ],
                    ['Posse declarada', p.tenure],
                    ['CAR', p.car],
                    ['Matrícula / contrato', p.registry],
                    [
                      'Latitude / longitude',
                      point
                        ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
                        : 'Localização pendente',
                    ],
                    ['Observações e referências', p.notes],
                  ]}
                />
                {writable && (
                  <button
                    type="button"
                    className="r-text-link producer-screen-actions"
                    onClick={() => onEditProperty(p)}
                  >
                    <MapPin size={14} />
                    Editar cadastro e pin
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {!properties.length && <p>Nenhuma propriedade cadastrada.</p>}
        <p className="producer-note">
          Hectares declarados e mapeados são apresentados separadamente. Os
          contornos, culturas e referências de matrícula são informados pelo
          responsável; a sobreposição CAR/SIGEF não certifica esses dados. A
          indicação e aceitação de possíveis garantias exigem análise própria.
        </p>
      </Section>

      <Section
        title="Mapas e memoriais das propriedades"
        subtitle="Contornos, legendas de matrícula, culturas e vértices da versão salva"
      >
        {properties.map((p) => (
          <MappingRecord key={p.id} property={p} expanded />
        ))}
      </Section>

      <Section
        title="Solicitações e histórico de crédito no sistema"
        subtitle="Valores solicitados não representam limite concedido ou dívida contratada"
        action={
          writable && (
            <button className="r-text-link" onClick={onNewRequest}>
              Nova solicitação
            </button>
          )
        }
      >
        {requests.length ? (
          <div className="r-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Solicitação</th>
                  <th>Responsável</th>
                  <th>Valor solicitado</th>
                  <th>Etapa</th>
                  <th>Atualização</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.id === selectedRequestId
                        ? 'producer-request-selected'
                        : ''
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="r-text-link"
                        onClick={() => onRequest(r.id)}
                      >
                        {r.title}
                      </button>
                      <small>
                        {r.data?.purpose || 'Finalidade não informada'}
                      </small>
                    </td>
                    <td>{r.consultant_name || 'Não informado'}</td>
                    <td>{money(r.data?.principal)}</td>
                    <td>
                      {stage[r.status] || r.status}
                      {r.id === selectedRequestId && (
                        <small>Em foco nesta página</small>
                      )}
                    </td>
                    <td>{date(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            O cadastro do produtor está disponível. A solicitação de crédito
            ainda não foi criada.
          </p>
        )}
      </Section>

      <Section
        title="Capacidade de pagamento e condições da solicitação"
        subtitle={
          request
            ? request.title
            : 'Selecione ou prepare uma solicitação para informar os dados financeiros'
        }
        action={
          request && (
            <button
              className="r-text-link"
              onClick={() => onNavigate('Viabilidade')}
            >
              Abrir análise completa
            </button>
          )
        }
      >
        {request ? (
          <>
            <Values
              rows={[
                ['Finalidade', request.data?.purpose],
                ['Período financeiro — início', request.data?.periodStart],
                ['Valor solicitado', money(request.data?.principal)],
                [
                  'Prazo',
                  request.data?.termMonths == null
                    ? 'Não informado'
                    : request.data.termMonths + ' meses',
                ],
                [
                  'Taxa mensal',
                  request.data?.monthlyRate == null
                    ? 'Não informada'
                    : number(request.data.monthlyRate) + '%',
                ],
                [
                  'Garantias — valor declarado',
                  money(request.data?.collateral),
                ],
              ]}
            />
            <div className="producer-metrics">
              {[
                ['Caixa disponível em 12 meses', result?.base?.available],
                ['Parcelas totais em 12 meses', result?.base?.debtService],
                ['Saldo no cenário base', result?.base?.balance],
                ['Saldo no cenário adverso', result?.stress?.balance],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {value == null ? 'Não calculado' : money(value)}
                  </strong>
                </div>
              ))}
            </div>
            {!fresh && (
              <p className="producer-note">
                {latest
                  ? 'A análise anterior ficou desatualizada. Recalcule para apresentar indicadores compatíveis com os dados atuais.'
                  : 'Ainda não há análise calculada para esta solicitação.'}
              </p>
            )}
            <div className="r-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Informação financeira</th>
                    <th>Valor declarado</th>
                    <th>Fonte registrada</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fields).map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>
                        {request.data?.[key] == null
                          ? 'Não informado'
                          : [
                                'monthlyRate',
                                'stressRevenuePct',
                                'stressCostPct',
                              ].includes(key)
                            ? number(request.data[key]) + '%'
                            : key === 'termMonths'
                              ? request.data[key] + ' meses'
                              : money(request.data[key])}
                      </td>
                      <td>
                        {request.data?.sources?.[key] || 'Fonte pendente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="producer-note">
              {result?.assumptions?.join(' ') ||
                'A análise utiliza dados informados e fontes registradas. Não há aprovação automática, nem validação de garantia.'}
            </p>
          </>
        ) : (
          <p>
            Receitas, custos, dívidas, condições e fontes ainda precisam ser
            vinculados a uma solicitação.
          </p>
        )}
      </Section>

      <Section
        title="Histórico produtivo, informações técnicas e observações"
        subtitle={
          request
            ? 'Informações da solicitação selecionada'
            : 'Sem solicitação selecionada'
        }
      >
        <Values
          rows={[
            [
              'Histórico produtivo e culturas informadas',
              request?.data?.history,
            ],
            ['Solo e documentos de suporte', request?.data?.soil],
            ['Clima e riscos relatados', request?.data?.climate],
            ['Observações da solicitação', request?.data?.notes],
          ]}
        />
      </Section>

      <Section
        title="Documentos e conferências do produtor"
        subtitle="Originais anexados às solicitações; selecione a solicitação correspondente para conferir"
      >
        {documents.length ? (
          <div className="r-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento / solicitação</th>
                  <th>Conferência</th>
                  <th>Responsável / data</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a
                        href={
                          '/api/documents/' +
                          encodeURIComponent(d.id) +
                          '/download'
                        }
                      >
                        <FileText size={14} />
                        {d.name}
                      </a>
                      <small>{d.request_title}</small>
                    </td>
                    <td>{stage[d.status] || d.status}</td>
                    <td>
                      {d.reviewer_name || 'Conferência pendente'}
                      <small>{date(d.reviewed_at)}</small>
                    </td>
                    <td>
                      {d.review_note || d.error || 'Sem observação registrada'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            Nenhum documento anexado. Matrículas, comprovantes e demais
            evidências devem ser reunidos na solicitação.
          </p>
        )}
      </Section>

      <Section
        title="Pareceres registrados"
        subtitle="Pareceres do fluxo atual; não representam liberação bancária ou aceitação jurídica de garantias"
      >
        {decisions.length ? (
          decisions.map((d) => (
            <article className="producer-opinion" key={d.id}>
              <h3>
                {d.request_title} · {stage[d.decision] || d.decision}
              </h3>
              <p>{d.justification}</p>
              <small>
                {d.actor_name || 'Responsável não informado'} ·{' '}
                {date(d.created_at)}
              </small>
            </article>
          ))
        ) : (
          <p>Nenhum parecer registrado para este produtor.</p>
        )}
      </Section>

      <Section
        title="Últimas movimentações"
        subtitle={
          history.length
            ? `${history.length} de ${history[0].total_events} eventos registrados; eventos recentes primeiro`
            : 'Alterações do produtor, propriedades e solicitações'
        }
      >
        <ol className="producer-history">
          {history.map((event) => (
            <li key={event.id}>
              <time>{date(event.created_at)}</time>
              <strong>{event.actor_name || 'Responsável não informado'}</strong>
              <span>
                {(
                  {
                    create: 'Cadastro incluído',
                    update: 'Cadastro atualizado',
                    location_updated: 'Localização da propriedade atualizada',
                    analyze: 'Análise calculada',
                    decision: 'Parecer registrado',
                    upload: 'Documento anexado',
                    extract: 'Leitura documental processada',
                    review: 'Documento conferido',
                    apply_fields: 'Valores conferidos aplicados',
                  } as Record<string, string>
                )[event.action] || event.action}{' '}
                ·{' '}
                {event.detail?.name ||
                  (
                    {
                      producer: 'produtor',
                      property: 'propriedade',
                      request: 'solicitação',
                      document: 'documento',
                    } as Record<string, string>
                  )[event.entity_type] ||
                  event.entity_type}
              </span>
            </li>
          ))}
        </ol>
        {!history.length && <p>Nenhuma movimentação disponível.</p>}
      </Section>
      <p className="producer-report-footer">
        Ficha de preparação para o comitê · Dados consultados em{' '}
        {date(data.generated_at)}. Representa o cadastro atual; o dossiê de uma
        análise preserva a revisão utilizada naquele cálculo.
      </p>
    </div>
  );
}
