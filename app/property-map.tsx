'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Leaflet from 'leaflet';
import {
  MapPin,
  Search,
  LocateFixed,
  RotateCcw,
  Maximize,
  Minimize,
  Layers,
  X,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';

type Row = Record<string, any>;
export type Point = { latitude: number; longitude: number };
export function pointOf(property?: Row): Point | null {
  if (
    property?.latitude == null ||
    property?.longitude == null ||
    property.latitude === '' ||
    property.longitude === ''
  )
    return null;
  const latitude = Number(property.latitude),
    longitude = Number(property.longitude);
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

async function municipalApi<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch('/api/maps/municipalities' + path, {
    credentials: 'same-origin',
    signal,
  });
  const data: any = await res.json();
  if (!res.ok)
    throw Error(data.error || 'Não foi possível localizar o município.');
  return data as T;
}

// Municipal searches use IBGE. Public raster tiles receive viewport bounds only.
// Pins and drawn geometry stay local until explicitly saved to the authenticated API.
export function PropertyMap({
  properties,
  selectedId,
  municipality,
  editable = false,
  onPick,
  onSelect,
  draft,
  formMode = false,
  polygons = [],
  drawing = [],
  activeAreaId,
  onDrawPoint,
  onVertexMove,
  onAreaSelect,
  showVertices = true,
  showRegistry = true,
  children,
  toolbar,
  workspaceTools,
  workspacePanel,
  workspaceActions,
  workspaceStatus,
  layerControls,
  showLayers = false,
  onLayersToggle,
  focusRequest,
  onVertexInsert,
  onDrawFinish,
}: {
  properties: Row[];
  selectedId?: string;
  municipality?: string;
  editable?: boolean;
  onPick?: (point: Point) => void;
  onSelect?: (id: string) => void;
  draft?: Point | null;
  formMode?: boolean;
  polygons?: Row[];
  drawing?: number[][];
  activeAreaId?: string;
  onDrawPoint?: (point: Point) => void;
  onVertexMove?: (index: number, point: Point) => void;
  onAreaSelect?: (id: string) => void;
  showVertices?: boolean;
  showRegistry?: boolean;
  children?: ReactNode;
  toolbar?: ReactNode;
  workspaceTools?: ReactNode;
  workspacePanel?: ReactNode;
  workspaceActions?: ReactNode;
  workspaceStatus?: ReactNode;
  layerControls?: ReactNode;
  showLayers?: boolean;
  onLayersToggle?: () => void;
  focusRequest?: { nonce: number; areaId?: string };
  onVertexInsert?: (index: number, point: Point) => void;
  onDrawFinish?: () => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null);
  const library = useRef<typeof Leaflet | null>(null),
    tiles = useRef<Leaflet.TileLayer | null>(null);
  const wrapper = useRef<HTMLDivElement>(null),
    fullscreenButton = useRef<HTMLButtonElement>(null);
  const geometryLayer = useRef<Leaflet.LayerGroup | null>(null);
  const officialLayers = useRef<Leaflet.TileLayer[]>([]);
  const callbacks = useRef({
    editable,
    onPick,
    onSelect,
    onDrawPoint,
    onVertexMove,
    onAreaSelect,
    onVertexInsert,
    onDrawFinish,
  });
  callbacks.current = {
    editable,
    onPick,
    onSelect,
    onDrawPoint,
    onVertexMove,
    onAreaSelect,
    onVertexInsert,
    onDrawFinish,
  };
  const [base, setBase] = useState('streets'),
    [expanded, setExpanded] = useState(false);
  const [uf, setUf] = useState(''),
    [carLayer, setCarLayer] = useState(false),
    [sigefLayer, setSigefLayer] = useState(false);
  const [officialError, setOfficialError] = useState<string[]>([]),
    [zoom, setZoom] = useState(4);
  const [layerAttempt, setLayerAttempt] = useState(0);
  const states =
    'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
      ' ',
    );
  useEffect(() => {
    const match = (municipality || '')
      .toUpperCase()
      .match(/(?:\/|[-, ]+)\s*([A-Z]{2})\s*$/);
    setUf(match && states.includes(match[1]) ? match[1] : '');
  }, [municipality]);
  useEffect(() => {
    if (!expanded) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const change = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener('keydown', escape);
      document.removeEventListener('fullscreenchange', change);
      fullscreenButton.current?.focus();
    };
  }, [expanded]);
  async function toggleFullscreen() {
    if (expanded) {
      if (document.fullscreenElement === wrapper.current)
        await document.exitFullscreen();
      setExpanded(false);
    } else {
      setExpanded(true);
      try {
        await wrapper.current?.requestFullscreen?.();
      } catch {
        /* Fixed viewport fallback, including unsupported mobile browsers. */
      }
    }
  }

  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState(''),
    [tileError, setTileError] = useState(false);
  const [query, setQuery] = useState(municipality || ''),
    [lookup, setLookup] = useState(municipality || '');
  const [choices, setChoices] = useState<Row[]>([]),
    [municipalId, setMunicipalId] = useState(''),
    [reference, setReference] = useState('');
  const [searching, setSearching] = useState(false),
    [lookupError, setLookupError] = useState('');
  const [bounds, setBounds] = useState<Leaflet.LatLngBoundsExpression | null>(
    null,
  );
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const focusMunicipality = useRef(false);
  const selected = properties.find((p) => p.id === selectedId),
    selectedPoint = pointOf(selected);
  const latitude = selectedPoint?.latitude,
    longitude = selectedPoint?.longitude;

  useEffect(() => {
    setQuery(municipality || '');
    setLookup(municipality || '');
    setMunicipalId('');
    setChoices([]);
    setReference('');
    setBounds(null);
  }, [municipality]);
  useEffect(() => {
    if (!lookup || lookup.trim().length < 3) return;
    const controller = new AbortController();
    setSearching(true);
    setLookupError('');
    setChoices([]);
    setMunicipalId('');
    setBounds(null);
    setReference('');
    municipalApi<Row[]>(
      '?name=' + encodeURIComponent(lookup.trim()),
      controller.signal,
    )
      .then((rows) => {
        if (controller.signal.aborted) return;
        setChoices(rows);
        if (rows.length === 1) setMunicipalId(String(rows[0].id));
        if (!rows.length)
          setLookupError(
            'Município não encontrado. Confira o nome e a UF, ou navegue no mapa.',
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLookupError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [lookup, lookupAttempt]);
  useEffect(() => {
    if (!municipalId) return;
    const controller = new AbortController();
    setSearching(true);
    setLookupError('');
    municipalApi<{ bounds: Leaflet.LatLngBoundsExpression }>(
      '/' + municipalId,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setBounds(result.bounds);
        const city = choices.find((c) => String(c.id) === municipalId);
        if (city) setUf(city.uf);
        setReference(
          city ? city.name + ' / ' + city.uf : 'Município consultado',
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLookupError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [municipalId, choices]);

  useEffect(() => {
    let live = true;
    let resize: ResizeObserver | undefined;
    import('leaflet')
      .then((L) => {
        if (!live || !element.current) return;
        library.current = L;
        const current = L.map(element.current, {
          center: [-14, -53],
          zoom: 4,
          minZoom: 3,
          maxZoom: 22,
          scrollWheelZoom: false,
          zoomControl: false,
        });
        map.current = current;
        L.control
          .zoom({
            position: 'topright',
            zoomInTitle: 'Aproximar',
            zoomOutTitle: 'Afastar',
          })
          .addTo(current);
        layer.current = L.layerGroup().addTo(current);
        geometryLayer.current = L.layerGroup().addTo(current);
        current.on('zoomend', () => setZoom(current.getZoom()));
        L.control.scale({ imperial: false }).addTo(current);
        current.on('click', (e: Leaflet.LeafletMouseEvent) => {
          if (callbacks.current.onDrawPoint) {
            callbacks.current.onDrawPoint({
              latitude: e.latlng.lat,
              longitude: e.latlng.wrap().lng,
            });
            return;
          }
          if (callbacks.current.editable)
            callbacks.current.onPick?.({
              latitude: e.latlng.lat,
              longitude: e.latlng.wrap().lng,
            });
        });
        resize = new ResizeObserver(() => current.invalidateSize());
        resize.observe(element.current);
        setReady(true);
      })
      .catch(() => {
        if (live)
          setMapError(
            'Não foi possível iniciar o mapa. Recarregue a página ou informe as coordenadas.',
          );
      });
    return () => {
      live = false;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const L = library.current,
      current = map.current;
    if (!ready || !L || !current) return;
    setTileError(false);
    const satellite = base === 'satellite';
    const tile = L.tileLayer(
      satellite
        ? 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 22,
        maxNativeZoom: satellite ? 19 : 19,
        attribution: satellite
          ? 'Esri World Imagery · Esri, Vantor, Earthstar Geographics, GIS User Community'
          : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
    )
      .on('tileerror', () => setTileError(true))
      .addTo(current);
    tile.setZIndex(0);
    tiles.current = tile;
    return () => {
      tile.off();
      tile.remove();
    };
  }, [ready, base]);
  useEffect(() => {
    const L = library.current,
      current = map.current;
    if (!ready || !L || !current) return;
    setOfficialError([]);
    officialLayers.current = [];
    if (!uf || zoom < 12) return;
    const add = (url: string, layers: string, label: string) => {
      const tile = L.tileLayer.wms(url, {
        layers,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxZoom: 22,
        opacity: 0.65,
        attribution: label,
        referrerPolicy: 'strict-origin-when-cross-origin',
      });
      tile
        .setZIndex(5)
        .on('tileerror', () =>
          setOfficialError((xs) => (xs.includes(label) ? xs : [...xs, label])),
        )
        .addTo(current);
      officialLayers.current.push(tile);
    };
    if (carLayer)
      add(
        'https://geoserver.car.gov.br/geoserver/sicar/wms',
        'sicar_imoveis_' + uf.toLowerCase(),
        'CAR · SICAR/SFB',
      );
    if (sigefLayer) {
      const name = 'certificada_sigef_particular_' + uf.toLowerCase();
      add(
        'https://acervofundiario.incra.gov.br/i3geo/ogc.php?tema=' + name,
        name,
        'SIGEF particular · INCRA',
      );
    }
    return () => {
      officialLayers.current.forEach((t) => {
        t.off();
        t.remove();
      });
      officialLayers.current = [];
    };
  }, [ready, uf, carLayer, sigefLayer, zoom < 12, layerAttempt]);
  useEffect(() => {
    const L = library.current,
      group = geometryLayer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const pointLabel = (text: string) => {
      const el = document.createElement('span');
      el.textContent = text;
      return el;
    };
    polygons.forEach((f) => {
      if (!f.coordinates?.length) return;
      const points = f.coordinates.map(
        ([lng, lat]: number[]) => [lat, lng] as [number, number],
      );
      const color = f.kind === 'total' ? '#3399ff' : '#22bb55';
      const poly = L.polygon(points, {
        color,
        fillOpacity: 0.14,
        weight: f.id === activeAreaId ? 4 : 2,
        interactive: !onDrawPoint,
      });
      poly.bindTooltip(
        pointLabel(
          `${f.name} · ${Number(f.area_ha || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ha${showRegistry ? ' · Matrícula: ' + (f.registry || 'não informada') : ''}`,
        ),
      );
      poly
        .on('click', (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          callbacks.current.onAreaSelect?.(f.id);
        })
        .addTo(group);
      if (showVertices)
        points.slice(0, -1).forEach((point: [number, number], i: number) =>
          L.circleMarker(point, {
            radius: 3,
            color,
            fillOpacity: 1,
            interactive: !onDrawPoint,
          })
            .bindTooltip(
              pointLabel(
                `V${String(i + 1).padStart(3, '0')} · Lat ${point[0].toFixed(7)} · Lon ${point[1].toFixed(7)}`,
              ),
            )
            .addTo(group),
        );
    });
    if (drawing.length) {
      const points = drawing.map(
        ([lng, lat]) => [lat, lng] as [number, number],
      );
      if (points.length >= 3)
        L.polygon(points, {
          color: '#f5b942',
          weight: 3,
          dashArray: '6 5',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(group);
      else
        L.polyline(points, { color: '#f5b942', interactive: false }).addTo(
          group,
        );
      points.forEach((point, i) => {
        const marker = L.marker(point, {
          draggable: !!onVertexMove,
          icon: L.divIcon({
            className: 'map-vertex',
            html: `<span>${i + 1}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        });
        marker.bindTooltip(
          pointLabel(
            `V${String(i + 1).padStart(3, '0')} · ${point[0].toFixed(7)}, ${point[1].toFixed(7)}`,
          ),
        );
        marker.on('click', (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          if (i === 0) callbacks.current.onDrawFinish?.();
        });
        marker
          .on('dragend', () => {
            const p = marker.getLatLng().wrap();
            callbacks.current.onVertexMove?.(i, {
              latitude: p.lat,
              longitude: p.lng,
            });
          })
          .addTo(group);
      });
      if (onVertexInsert && points.length >= 2)
        points.forEach((p, i) => {
          if (i === points.length - 1 && points.length < 3) return;
          const next = points[(i + 1) % points.length];
          const midpoint: [number, number] = [
            (p[0] + next[0]) / 2,
            (p[1] + next[1]) / 2,
          ];
          L.marker(midpoint, {
            icon: L.divIcon({
              className: 'map-midpoint',
              html: '<span>+</span>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
            title: 'Inserir vértice nesta borda',
          })
            .on('click', (e: Leaflet.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              callbacks.current.onVertexInsert?.(i + 1, {
                latitude: midpoint[0],
                longitude: midpoint[1],
              });
            })
            .addTo(group);
        });
    }
  }, [
    ready,
    polygons,
    drawing,
    activeAreaId,
    onDrawPoint,
    onVertexMove,
    showVertices,
    showRegistry,
    onVertexInsert,
    onDrawFinish,
  ]);
  useEffect(() => {
    const L = library.current,
      group = layer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const property of properties) {
      const point = pointOf(property);
      if (!point || (property.id === selectedId && draft)) continue;
      const label = document.createElement('span');
      label.textContent = property.name || 'Propriedade';
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: property.id === selectedId ? 10 : 7,
        color: '#fff',
        weight: 2,
        fillColor: property.id === selectedId ? '#123a50' : '#32846b',
        fillOpacity: 1,
      });
      marker
        .bindTooltip(label)
        .on('click', (e: Leaflet.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          callbacks.current.onSelect?.(property.id);
        })
        .addTo(group);
    }
    if (draft) {
      const marker = L.marker([draft.latitude, draft.longitude], {
        draggable: editable,
        icon: L.divIcon({
          className: 'producer-pin',
          html: '<span></span>',
          iconSize: [28, 38],
          iconAnchor: [14, 38],
        }),
        title: 'Localização escolhida — salvar para confirmar',
      }).addTo(group);
      marker.on('dragend', () => {
        const p = marker.getLatLng().wrap();
        callbacks.current.onPick?.({ latitude: p.lat, longitude: p.lng });
      });
    }
  }, [ready, properties, selectedId, draft, editable]);

  useEffect(() => {
    if (!ready || !map.current) return;
    if (bounds && focusMunicipality.current) {
      map.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
      focusMunicipality.current = false;
    } else if (polygons.length || drawing.length) {
      return;
    } else if (latitude != null && longitude != null)
      map.current.setView([latitude, longitude], 15);
    else if (bounds)
      map.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
    else map.current.setView([-14, -53], 4);
  }, [ready, selectedId, latitude, longitude, bounds]);

  const lastFocus = useRef(-1);
  useEffect(() => {
    if (
      !ready ||
      !map.current ||
      !focusRequest ||
      focusRequest.nonce === lastFocus.current
    )
      return;
    const area = focusRequest.areaId
      ? polygons.find((p) => p.id === focusRequest.areaId)
      : null;
    const coords =
      area?.coordinates ||
      (focusRequest.areaId === activeAreaId && drawing.length
        ? drawing
        : polygons.flatMap((p) => p.coordinates));
    if (!coords?.length) return;
    lastFocus.current = focusRequest.nonce;
    map.current.fitBounds(
      coords.map(([lng, lat]: number[]) => [lat, lng] as [number, number]),
      {
        paddingTopLeft: map.current.getSize().x > 760 ? [120, 50] : [30, 110],
        paddingBottomRight:
          map.current.getSize().x > 760 && focusRequest.areaId
            ? [350, 110]
            : [50, 150],
        maxZoom: 18,
      },
    );
  }, [ready, focusRequest, polygons, drawing, activeAreaId]);
  function centerPin() {
    if (polygons.length && map.current) {
      map.current.fitBounds(
        polygons.flatMap((f) =>
          f.coordinates.map(
            ([lng, lat]: number[]) => [lat, lng] as [number, number],
          ),
        ),
        { padding: [30, 30], maxZoom: 18 },
      );
      return;
    }
    const point = draft || selectedPoint;
    if (point && map.current)
      map.current.setView([point.latitude, point.longitude], 16);
    else if (bounds)
      map.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }
  function searchCity() {
    focusMunicipality.current = true;
    setLookup(query);
    setLookupAttempt((n) => n + 1);
  }
  return (
    <div
      ref={wrapper}
      className={
        'producer-map' +
        (formMode ? ' producer-map-form' : '') +
        (expanded ? ' producer-map-fullscreen' : '')
      }
    >
      <div className="producer-map-layers producer-screen-actions">
        <div className="map-base-switch" aria-label="Base do mapa">
          <button
            type="button"
            aria-pressed={base === 'streets'}
            onClick={() => setBase('streets')}
          >
            Mapa
          </button>
          <button
            type="button"
            aria-pressed={base === 'satellite'}
            onClick={() => setBase('satellite')}
          >
            Satélite
          </button>
        </div>
        <div className="map-top-actions">
          <button
            type="button"
            ref={fullscreenButton}
            className="r-btn r-btn-secondary"
            onClick={() => void toggleFullscreen()}
          >
            {expanded ? <Minimize size={16} /> : <Maximize size={16} />}{' '}
            {expanded ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        </div>
      </div>
      <details className="map-municipality-search producer-screen-actions">
        <summary>
          <Search size={16} /> Buscar município ou centralizar
        </summary>
        <div className="producer-map-search">
          <label>
            <span>Município / UF</span>
            <input
              aria-label="Município para abrir o mapa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!searching) searchCity();
                }
              }}
              placeholder="Ex.: Roque Gonzales / RS"
            />
          </label>
          <button
            type="button"
            className="r-btn r-btn-secondary"
            disabled={searching || query.trim().length < 3}
            onClick={searchCity}
          >
            <Search size={15} />
            {searching ? 'Localizando…' : 'Abrir município'}
          </button>
          <button
            type="button"
            className="r-btn r-btn-secondary"
            onClick={centerPin}
            disabled={!draft && !selectedPoint && !bounds && !polygons.length}
          >
            <LocateFixed size={15} />
            Centralizar
          </button>
        </div>
        {choices.length > 1 && (
          <label className="producer-map-choices">
            Escolha o município
            <select
              value={municipalId}
              onChange={(e) => {
                focusMunicipality.current = true;
                setMunicipalId(e.target.value);
              }}
            >
              <option value="">Selecione município e UF</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} / {c.uf}
                </option>
              ))}
            </select>
          </label>
        )}
        {lookupError && (
          <p role="status" className="producer-map-message">
            {lookupError}
          </p>
        )}
      </details>
      {toolbar}
      <div
        className={
          'producer-map-surface' +
          (workspaceTools ? ' map-workbench-stage' : '')
        }
      >
        <div
          ref={element}
          className="producer-leaflet"
          aria-label="Mapa interativo da propriedade"
        />
        {workspaceTools && (
          <div className="map-workbench-overlay producer-screen-actions">
            {workspaceTools}
            {showLayers ? (
              <aside
                className="map-workspace-panel map-layers-panel"
                aria-label="Camadas do mapa"
              >
                <header>
                  <h3>Camadas do mapa</h3>
                  <button
                    type="button"
                    onClick={onLayersToggle}
                    aria-label="Fechar camadas"
                  >
                    <X size={18} />
                  </button>
                </header>
                <div className="map-workspace-panel-body">
                  <h4>Camadas oficiais</h4>
                  <div className="producer-map-layers">
                    <label>
                      UF{' '}
                      <select
                        aria-label="UF das camadas oficiais"
                        value={uf}
                        onChange={(e) => setUf(e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {states.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={carLayer}
                        onChange={(e) => setCarLayer(e.target.checked)}
                      />{' '}
                      CAR · SICAR/SFB
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={sigefLayer}
                        onChange={(e) => setSigefLayer(e.target.checked)}
                      />{' '}
                      SIGEF · INCRA (particular)
                    </label>
                  </div>
                  <p>
                    Sobreposição de referência. Não vincula automaticamente CAR,
                    certificação ou matrícula ao produtor.
                  </p>
                  {(carLayer || sigefLayer) && (!uf || zoom < 12) && (
                    <p role="status">
                      {!uf
                        ? 'Escolha a UF.'
                        : 'Aproxime o mapa para carregar as camadas (zoom 12 ou maior).'}
                    </p>
                  )}
                  {officialError.length > 0 && (
                    <p role="status">
                      {officialError.join(' / ')}: falha no serviço externo. A
                      ausência de contorno não comprova ausência de cadastro.{' '}
                      <button
                        type="button"
                        onClick={() => setLayerAttempt((n) => n + 1)}
                      >
                        Tentar novamente
                      </button>
                    </p>
                  )}
                  <h4>Áreas cadastradas e legendas</h4>
                  {layerControls}
                </div>
              </aside>
            ) : (
              workspacePanel
            )}
            <div className="map-canvas-status" aria-live="polite">
              {workspaceStatus}
            </div>
            {workspaceActions}
          </div>
        )}
        {!ready && (
          <p className="producer-map-loading" role="status">
            {mapError || 'Abrindo mapa…'}
          </p>
        )}
      </div>
      {tileError && (
        <div role="status" className="producer-map-message">
          A base cartográfica não carregou completamente. Verifique a conexão ou
          tente novamente.
          <button
            type="button"
            onClick={() => {
              setTileError(false);
              tiles.current?.redraw();
            }}
          >
            <RotateCcw size={14} />
            Tentar novamente
          </button>
        </div>
      )}
      <div className="producer-map-caption">
        <MapPin size={16} />
        <span>
          {onDrawPoint
            ? 'Clique para adicionar vértices. Arraste os pontos numerados para ajustar o contorno.'
            : editable
              ? 'Clique no local da propriedade. Arraste o pin para ajustar; salve para confirmar.'
              : selectedPoint
                ? 'Pontos cadastrados do produtor. Selecione uma propriedade para ver os dados.'
                : 'Localização da propriedade ainda não marcada.'}
          {reference && (
            <small>
              Referência municipal: {reference} · IBGE. O município não define a
              localização nem os limites do imóvel.
            </small>
          )}
        </span>
      </div>
      {base === 'satellite' && (
        <p className="producer-map-source">
          Imagem de referência Esri World Imagery; a data varia por região. A
          cultura atual deve ser informada no cadastro.
        </p>
      )}
      {children}
    </div>
  );
}
