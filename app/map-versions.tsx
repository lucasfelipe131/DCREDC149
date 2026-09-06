'use client';
import { Download, History, RefreshCw } from 'lucide-react';
type Row = Record<string, any>;
export function MapVersions({
  versions,
  loading,
  error,
  propertyId,
  currentRevision,
  shownRevision,
  locked,
  lockMessage = '',
  onRetry,
  onView,
  onReturn,
}: {
  versions: Row[];
  loading: boolean;
  error: string;
  propertyId?: string;
  currentRevision: number;
  shownRevision: number;
  locked: boolean;
  lockMessage?: string;
  onRetry: () => void;
  onView: (revision: number) => void;
  onReturn: () => void;
}) {
  return (
    <div className="map-versions-content" aria-busy={loading}>
      <p>Cada gravação do mapeamento cria uma versão com data e responsável.</p>
      {locked && lockMessage && (
        <p className="map-panel-note">
          {lockMessage}{' '}
          <button type="button" onClick={onReturn}>
            Voltar à edição
          </button>
        </p>
      )}
      {!propertyId ? (
        <div className="map-empty-state">
          <History size={28} />
          <strong>Cadastre a propriedade primeiro</strong>
          <p>
            As versões ficam disponíveis depois de salvar o cadastro e seu
            primeiro mapeamento.
          </p>
        </div>
      ) : loading ? (
        <p className="map-loading-state" role="status">
          <RefreshCw size={18} className="map-spinning" /> Carregando versões do
          mapa…
        </p>
      ) : error ? (
        <div className="map-panel-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      ) : !versions.length ? (
        <div className="map-empty-state">
          <History size={28} />
          <strong>Nenhuma versão salva ainda</strong>
          <p>
            Marque o perímetro em “Área total”, conclua o desenho e clique em
            “Salvar mapeamento”. Salvar somente o pin não cria uma versão de
            áreas.
          </p>
          <button type="button" onClick={onReturn}>
            Voltar ao mapa
          </button>
        </div>
      ) : (
        <>
          <div className="map-history-heading">
            <span>{versions.length} versão(ões) disponíveis</span>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Atualizar lista de versões"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <ol className="map-version-list">
            {versions.map((v) => (
              <li
                key={v.revision}
                className={shownRevision === v.revision ? 'selected' : ''}
              >
                <div>
                  <strong>Versão {v.revision}</strong>
                  <span>
                    {v.revision === currentRevision
                      ? 'Atual'
                      : shownRevision === v.revision
                        ? 'Em consulta'
                        : 'Histórica'}
                  </span>
                </div>
                <p>
                  {new Date(v.created_at).toLocaleString('pt-BR')}
                  <br />
                  {v.actor_name || 'Responsável não informado'}
                </p>
                <p>
                  {Number(v.summary?.total_ha || 0).toLocaleString('pt-BR', {
                    maximumFractionDigits: 4,
                  })}{' '}
                  ha total ·{' '}
                  {Number(v.summary?.productive_ha || 0).toLocaleString(
                    'pt-BR',
                    { maximumFractionDigits: 4 },
                  )}{' '}
                  ha produtiva
                </p>
                <div className="map-version-actions">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onView(v.revision)}
                  >
                    {shownRevision === v.revision
                      ? 'Reabrir no mapa'
                      : 'Abrir no mapa'}
                  </button>
                  {(v.summary?.total_count || 0) > 0 && (
                    <a
                      href={
                        '/api/properties/' +
                        encodeURIComponent(propertyId) +
                        '/mapping/kml?revision=' +
                        v.revision
                      }
                    >
                      <Download size={15} /> KML
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
