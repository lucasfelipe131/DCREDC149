'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { MapPin, Search, LocateFixed, RotateCcw } from 'lucide-react';
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

// Only municipal bounds go to the external service. Pin selection remains local
// until the surrounding form explicitly saves it to the application API.
export function PropertyMap({
  properties,
  selectedId,
  municipality,
  editable = false,
  onPick,
  onSelect,
  draft,
  formMode = false,
}: {
  properties: Row[];
  selectedId?: string;
  municipality?: string;
  editable?: boolean;
  onPick?: (point: Point) => void;
  onSelect?: (id: string) => void;
  draft?: Point | null;
  formMode?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null);
  const library = useRef<typeof Leaflet | null>(null),
    tiles = useRef<Leaflet.TileLayer | null>(null);
  const callbacks = useRef({ editable, onPick, onSelect });
  callbacks.current = { editable, onPick, onSelect };
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
          maxZoom: 19,
          scrollWheelZoom: false,
        });
        map.current = current;
        tiles.current = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
            referrerPolicy: 'strict-origin-when-cross-origin',
          },
        )
          .on('tileerror', () => {
            if (live) setTileError(true);
          })
          .addTo(current);
        layer.current = L.layerGroup().addTo(current);
        L.control.scale({ imperial: false }).addTo(current);
        current.on('click', (e: Leaflet.LeafletMouseEvent) => {
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
    } else if (latitude != null && longitude != null)
      map.current.setView([latitude, longitude], 15);
    else if (bounds)
      map.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
    else map.current.setView([-14, -53], 4);
  }, [ready, selectedId, latitude, longitude, bounds]);

  function centerPin() {
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
    <div className={'producer-map' + (formMode ? ' producer-map-form' : '')}>
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
          disabled={!draft && !selectedPoint && !bounds}
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
      <div className="producer-map-surface">
        <div
          ref={element}
          className="producer-leaflet"
          aria-label="Mapa interativo da propriedade"
        />
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
          {editable
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
    </div>
  );
}
