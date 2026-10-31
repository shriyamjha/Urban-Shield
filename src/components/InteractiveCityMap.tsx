import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  CityPoi,
  CommunityReport,
  HistoricalCrimeRecord,
  MapLayerCategory,
  SmartRouteOption,
  SosIncident,
} from '../types/urbanshield.ts';
import { Layers, Globe, Eye } from 'lucide-react';

interface InteractiveCityMapProps {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  userLocation: { lat: number; lng: number };
  pois: CityPoi[];
  reports?: CommunityReport[];
  sosIncidents?: SosIncident[];
  crimeRecords?: HistoricalCrimeRecord[];
  activeLayers: Set<MapLayerCategory>;
  selectedPoi: CityPoi | null;
  onSelectPoi: (poi: CityPoi) => void;
  routes?: SmartRouteOption[];
  selectedRouteId?: string;
  onSelectRoute?: (routeId: string) => void;
  originCoords?: { lat: number; lng: number; label?: string };
  destinationCoords?: { lat: number; lng: number; label?: string };
  onMapClickCoordinates?: (lat: number, lng: number) => void;
  heightClass?: string;
  maxMarkers?: number;
}

export const CATEGORY_STYLE_MAP: Record<
  MapLayerCategory,
  { color: string; shortCode: string; label: string }
> = {
  hospital: { color: '#EF4444', shortCode: 'H', label: 'Hospitals' },
  clinic: { color: '#F87171', shortCode: 'CL', label: 'Clinics' },
  pharmacy: { color: '#10B981', shortCode: 'Rx', label: 'Pharmacies' },
  police: { color: '#3B82F6', shortCode: 'PS', label: 'Police Stations' },
  fuel: { color: '#F59E0B', shortCode: 'FP', label: 'Petrol Pumps' },
  restaurant: { color: '#F97316', shortCode: 'R', label: 'Restaurants' },
  cafe: { color: '#FB923C', shortCode: 'CF', label: 'Cafes' },
  shop: { color: '#A855F7', shortCode: 'SH', label: 'Shops' },
  transport: { color: '#00D2FF', shortCode: 'TR', label: 'Public Transport' },
  education: { color: '#6366F1', shortCode: 'ED', label: 'Educational' },
  cctv: { color: '#14B8A6', shortCode: 'CC', label: 'CCTV Infrastructure' },
  streetlight: { color: '#FACC15', shortCode: 'SL', label: 'Streetlights' },
  incident: { color: '#E11D48', shortCode: '!', label: 'Community Reports' },
  crime_hotspot: { color: '#DC2626', shortCode: 'CR', label: 'Crime Hotspots' },
};

const iconCache = new Map<string, L.DivIcon>();

function getCategoryDivIcon(category: MapLayerCategory, isSelected: boolean): L.DivIcon {
  const key = `${category}:${isSelected ? 'sel' : 'norm'}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const cfg = CATEGORY_STYLE_MAP[category] || CATEGORY_STYLE_MAP.shop;
  const size = isSelected ? 30 : 22;
  const fontSize = isSelected ? 10 : 8;
  const border = isSelected ? '2px solid #FFFFFF' : '1.5px solid #08090B';
  const ring = isSelected ? `0 0 0 3px ${cfg.color}66, 0 4px 12px rgba(0,0,0,0.85)` : '0 2px 6px rgba(0,0,0,0.75)';

  const icon = L.divIcon({
    className: 'urbanshield-custom-marker',
    html: `<div style="
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      background:${cfg.color};
      border:${border};
      box-shadow:${ring};
      color:#08090B;
      font-family:'JetBrains Mono',monospace;
      font-weight:700;
      font-size:${fontSize}px;
      display:flex;
      align-items:center;
      justify-content:center;
      letter-spacing:-0.03em;
    ">${cfg.shortCode}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  iconCache.set(key, icon);
  return icon;
}

function getEndpointIcon(kind: 'origin' | 'destination' | 'user'): L.DivIcon {
  const key = `endpoint:${kind}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  if (kind === 'user') {
    const icon = L.divIcon({
      className: 'urbanshield-user-marker',
      html: `<div style="
        width:16px;
        height:16px;
        border-radius:9999px;
        background:#00D2FF;
        border:2.5px solid #FFFFFF;
        box-shadow:0 0 0 4px rgba(0,210,255,0.28), 0 2px 8px rgba(0,0,0,0.8);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    iconCache.set(key, icon);
    return icon;
  }

  const bg = kind === 'origin' ? '#00D2FF' : '#F59E0B';
  const letter = kind === 'origin' ? 'A' : 'B';

  const icon = L.divIcon({
    className: 'urbanshield-endpoint-marker',
    html: `<div style="
      width:28px;
      height:28px;
      border-radius:6px;
      background:${bg};
      border:2px solid #08090B;
      box-shadow:0 4px 14px rgba(0,0,0,0.85);
      color:#08090B;
      font-family:'JetBrains Mono',monospace;
      font-weight:800;
      font-size:12px;
      display:flex;
      align-items:center;
      justify-content:center;
    ">${letter}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
  iconCache.set(key, icon);
  return icon;
}

const MapViewportController: React.FC<{
  center: [number, number];
  zoom: number;
  routes: SmartRouteOption[];
  selectedPoi: CityPoi | null;
  onMapClickCoordinates?: (lat: number, lng: number) => void;
}> = ({ center, zoom, routes, selectedPoi, onMapClickCoordinates }) => {
  const map = useMap();

  useMapEvents({
    click(e) {
      if (onMapClickCoordinates) {
        onMapClickCoordinates(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  // Ensure responsive sizing
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  // Fly to center when explicitly changed
  useEffect(() => {
    if (routes.length === 0) {
      map.setView([center[1], center[0]], zoom, { animate: true });
    }
  }, [center[0], center[1], zoom, map, routes.length]);

  // Pan to selected POI
  useEffect(() => {
    if (selectedPoi) {
      map.panTo([selectedPoi.latitude, selectedPoi.longitude], { animate: true });
    }
  }, [selectedPoi, map]);

  // Fit bounds when routes change
  useEffect(() => {
    if (routes.length > 0 && routes[0].geometry.length > 1) {
      const allLatLngs: [number, number][] = [];
      for (const r of routes) {
        for (const [lng, lat] of r.geometry) {
          allLatLngs.push([lat, lng]);
        }
      }
      if (allLatLngs.length > 1) {
        const bounds = L.latLngBounds(allLatLngs);
        map.fitBounds(bounds, { padding: [42, 42], maxZoom: 15 });
      }
    }
  }, [routes, map]);

  return null;
};

export const InteractiveCityMap: React.FC<InteractiveCityMapProps> = ({
  center,
  zoom = 13,
  userLocation,
  pois,
  reports = [],
  sosIncidents = [],
  crimeRecords = [],
  activeLayers,
  selectedPoi,
  onSelectPoi,
  routes = [],
  selectedRouteId,
  onSelectRoute,
  originCoords,
  destinationCoords,
  onMapClickCoordinates,
  heightClass = 'h-full min-h-[520px]',
  maxMarkers = 90,
}) => {
  const [tileMode, setTileMode] = useState<'osm_dark' | 'osm_standard' | 'satellite'>('osm_dark');
  const [satelliteFallbackNotice, setSatelliteFallbackNotice] = useState(false);

  const visiblePois = useMemo(() => {
    return pois
      .filter((p) => activeLayers.has(p.category))
      .slice(0, maxMarkers);
  }, [pois, activeLayers, maxMarkers]);

  const visibleReports = useMemo(() => {
    if (!activeLayers.has('incident')) return [];
    return reports.filter((r) => r.verificationStatus !== 'resolved');
  }, [reports, activeLayers]);

  const visibleCrimeRecords = useMemo(() => {
    if (!activeLayers.has('crime_hotspot') && crimeRecords.length === 0) return [];
    return crimeRecords;
  }, [crimeRecords, activeLayers]);

  return (
    <div
      className={`relative w-full ${heightClass} rounded-lg overflow-hidden border border-[#22262E] bg-[#08090B]`}
    >
      <MapContainer
        center={[center[1], center[0]]}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <MapViewportController
          center={center}
          zoom={zoom}
          routes={routes}
          selectedPoi={selectedPoi}
          onMapClickCoordinates={onMapClickCoordinates}
        />

        {/* Tile Layer: Standard OpenStreetMap or Esri World Imagery Satellite with graceful fallback */}
        {tileMode === 'satellite' ? (
          <TileLayer
            key="esri-satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, USGS, GeoEye, OpenStreetMap contributors"
            maxZoom={19}
            eventHandlers={{
              tileerror: () => {
                setSatelliteFallbackNotice(true);
                setTileMode('osm_dark');
              },
            }}
          />
        ) : (
          <TileLayer
            key={tileMode}
            className={tileMode === 'osm_dark' ? 'urbanshield-osm-dark-tiles' : ''}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        )}

        {/* Historical Crime Jurisdictional / Heatmap Circles */}
        {visibleCrimeRecords.map((rec) => {
          const isInsufficient = rec.geographicGranularity === 'insufficient_data';
          const isDistrict = rec.geographicGranularity === 'district';
          const strokeColor = isInsufficient
            ? '#6B7280'
            : isDistrict
            ? '#F59E0B'
            : rec.incidentCount && rec.incidentCount >= 100
            ? '#EF4444'
            : '#F97316';

          return (
            <Circle
              key={rec.id}
              center={[rec.latitude, rec.longitude]}
              radius={rec.radiusMeters}
              pathOptions={{
                color: strokeColor,
                weight: isDistrict || isInsufficient ? 1.5 : 2,
                dashArray: isDistrict || isInsufficient ? '6 6' : undefined,
                fillColor: strokeColor,
                fillOpacity: isInsufficient ? 0.08 : isDistrict ? 0.07 : 0.22,
              }}
            >
              <Popup>
                <div className="p-3 min-w-[230px] space-y-1.5 text-xs bg-[#111316] text-white">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8A909E]">
                    <span>{rec.year} RECORD</span>
                    <span>{rec.geographicGranularity.toUpperCase().replace('_', ' ')}</span>
                  </div>
                  <div className="font-semibold text-white">{rec.policeStation}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{rec.sectorOrLocality}</div>
                  <div className="pt-1 border-t border-[#22262E] flex items-center justify-between font-mono">
                    <span className="text-[#8A909E]">{rec.crimeCategory}:</span>
                    <span className="text-white font-semibold">
                      {rec.incidentCount !== null
                        ? `${rec.incidentCount} recorded FIRs`
                        : 'Insufficient granular data'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8A909E] leading-relaxed">{rec.notes}</div>
                  <div className="text-[10px] font-mono text-[#00D2FF] pt-0.5">
                    Source: {rec.source}
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* Route Polylines (Unselected alternatives first, then selected route on top) */}
        {routes
          .slice()
          .sort((a, b) => (a.id === selectedRouteId ? 1 : b.id === selectedRouteId ? -1 : 0))
          .map((route) => {
            const isSelected = route.id === selectedRouteId;
            const latLngs: [number, number][] = route.geometry.map(([lng, lat]) => [lat, lng]);
            const strokeColor = route.isRecommended
              ? '#F59E0B' // Gold/Amber for Recommended route
              : route.type === 'fastest'
              ? '#00D2FF' // Electric Cyan for Fastest route
              : '#10B981'; // Emerald for Higher Activity route

            return (
              <Polyline
                key={route.id}
                positions={latLngs}
                pathOptions={{
                  color: isSelected ? strokeColor : '#6B7280',
                  weight: isSelected ? 5.5 : 3.5,
                  opacity: isSelected ? 0.96 : 0.45,
                  dashArray: isSelected ? undefined : '6 6',
                }}
                eventHandlers={{
                  click: () => {
                    if (onSelectRoute) onSelectRoute(route.id);
                  },
                }}
              >
                <Popup>
                  <div className="p-2.5 text-xs bg-[#111316] text-white space-y-1">
                    <div className="font-semibold">{route.label}</div>
                    <div className="font-mono text-[11px] text-[#9CA3AF]">
                      {(route.distanceMeters / 1000).toFixed(1)} km · ~
                      {Math.max(1, Math.round(route.durationSeconds / 60))} min · Activity:{' '}
                      {route.nightActivity.overallScore ?? 'N/A'}/100
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* User Current Location Marker */}
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={getEndpointIcon('user')}
        >
          <Popup>
            <div className="p-2.5 text-xs bg-[#111316] text-white">
              <div className="font-semibold text-[#00D2FF]">Your Active GPS Position</div>
              <div className="font-mono text-[11px] text-[#9CA3AF] mt-0.5">
                {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Origin & Destination Markers (when in Smart Routes) */}
        {originCoords && (
          <Marker
            position={[originCoords.lat, originCoords.lng]}
            icon={getEndpointIcon('origin')}
          >
            <Popup>
              <div className="p-2.5 text-xs bg-[#111316] text-white">
                <div className="text-[10px] font-mono text-[#00D2FF]">ORIGIN (A)</div>
                <div className="font-semibold mt-0.5">{originCoords.label || 'Origin'}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {destinationCoords && (
          <Marker
            position={[destinationCoords.lat, destinationCoords.lng]}
            icon={getEndpointIcon('destination')}
          >
            <Popup>
              <div className="p-2.5 text-xs bg-[#111316] text-white">
                <div className="text-[10px] font-mono text-[#F59E0B]">DESTINATION (B)</div>
                <div className="font-semibold mt-0.5">
                  {destinationCoords.label || 'Destination'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Active Layer POI Markers */}
        {visiblePois.map((poi) => {
          const isSelected = selectedPoi?.id === poi.id;
          return (
            <Marker
              key={poi.id}
              position={[poi.latitude, poi.longitude]}
              icon={getCategoryDivIcon(poi.category, isSelected)}
              eventHandlers={{
                click: () => onSelectPoi(poi),
              }}
            >
              <Popup>
                <div className="p-3 min-w-[210px] space-y-1.5 text-xs bg-[#111316] text-white">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#00D2FF]">
                    <span>{poi.category.toUpperCase()}</span>
                    <span>{poi.verified ? 'VERIFIED OSM' : 'UNVERIFIED'}</span>
                  </div>
                  <div className="font-semibold text-white leading-snug">{poi.name}</div>
                  {poi.address && (
                    <div className="text-[11px] text-[#9CA3AF]">{poi.address}</div>
                  )}
                  {poi.openingHours && (
                    <div className="text-[11px] font-mono text-emerald-400">
                      Hours: {poi.openingHours}
                    </div>
                  )}
                  {poi.coverageNote && (
                    <div className="text-[10px] text-amber-300/90 pt-1 border-t border-[#22262E]">
                      {poi.coverageNote}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Community Incident Reports Markers */}
        {visibleReports.map((rep) => (
          <Marker
            key={`rep-${rep.id}`}
            position={[rep.latitude, rep.longitude]}
            icon={getCategoryDivIcon('incident', false)}
            eventHandlers={{
              click: () =>
                onSelectPoi({
                  id: rep.id,
                  name: rep.title,
                  category: 'incident',
                  latitude: rep.latitude,
                  longitude: rep.longitude,
                  address: rep.locationLabel,
                  openingHours: `Status: ${rep.verificationStatus.replace('_', ' ')} (${rep.confirmationsCount} confirms)`,
                  source: 'Community Report',
                  verified: rep.verificationStatus === 'moderator_verified',
                }),
            }}
          >
            <Popup>
              <div className="p-3 min-w-[210px] space-y-1 text-xs bg-[#111316] text-white">
                <div className="text-[10px] font-mono text-rose-400 uppercase">
                  COMMUNITY REPORT · {rep.verificationStatus.replace('_', ' ')}
                </div>
                <div className="font-semibold">{rep.title}</div>
                <div className="text-[11px] text-[#9CA3AF]">{rep.description}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Active SOS Markers */}
        {sosIncidents
          .filter((s) => s.status === 'active' || s.status === 'acknowledged')
          .map((sos) => (
            <Circle
              key={`sos-${sos.id}`}
              center={[sos.latitude, sos.longitude]}
              radius={250}
              pathOptions={{
                color: '#EF4444',
                weight: 2,
                fillColor: '#EF4444',
                fillOpacity: 0.3,
              }}
            >
              <Popup>
                <div className="p-2.5 text-xs bg-[#111316] text-white">
                  <div className="font-mono font-bold text-red-400">ACTIVE SOS ALERT</div>
                  <div className="font-semibold mt-0.5">{sos.userName}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{sos.areaLabel}</div>
                </div>
              </Popup>
            </Circle>
          ))}
      </MapContainer>

      {/* Top-Right Basemap Switcher (NightWise Dark OSM | Standard OSM | Esri Satellite) */}
      <div className="absolute top-2.5 right-2.5 z-[400] flex items-center gap-1 bg-[#111316]/95 border border-[#262930] rounded-md p-1 shadow-lg">
        <button
          type="button"
          onClick={() => setTileMode('osm_dark')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            tileMode === 'osm_dark'
              ? 'bg-[#181A1F] text-[#00D2FF] border border-[#00D2FF]/40'
              : 'text-[#8A909E] hover:text-white'
          }`}
        >
          <Eye className="w-3 h-3" />
          <span>Dark OSM</span>
        </button>
        <button
          type="button"
          onClick={() => setTileMode('osm_standard')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            tileMode === 'osm_standard'
              ? 'bg-[#181A1F] text-[#00D2FF] border border-[#00D2FF]/40'
              : 'text-[#8A909E] hover:text-white'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Standard OSM</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSatelliteFallbackNotice(false);
            setTileMode('satellite');
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            tileMode === 'satellite'
              ? 'bg-[#181A1F] text-[#00D2FF] border border-[#00D2FF]/40'
              : 'text-[#8A909E] hover:text-white'
          }`}
        >
          <Globe className="w-3 h-3" />
          <span>Satellite</span>
        </button>
      </div>

      {satelliteFallbackNotice && (
        <div className="absolute top-12 right-2.5 z-[400] bg-[#111316]/95 border border-amber-500/40 rounded px-2.5 py-1 text-[10px] text-amber-300">
          Satellite tile unavailable — automatically switched to OpenStreetMap
        </div>
      )}

      {/* Bottom-Left Compact Legend */}
      <div className="absolute bottom-2.5 left-2.5 z-[400] bg-[#08090B]/90 border border-[#22262E] rounded-md px-2.5 py-1.5 text-[10px] text-[#9CA3AF] flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[82%] pointer-events-none">
        {routes.length > 0 ? (
          <>
            <span className="text-white font-mono">
              <strong className="text-[#F59E0B]">━</strong> Recommended
            </span>
            <span className="text-white font-mono">
              <strong className="text-[#00D2FF]">━</strong> Fastest
            </span>
            <span className="text-white font-mono">
              <strong className="text-[#10B981]">━</strong> Higher Activity
            </span>
            <span>·</span>
          </>
        ) : null}
        <span>H Hospital</span>
        <span>·</span>
        <span>PS Police</span>
        <span>·</span>
        <span>Rx Pharmacy</span>
        <span>·</span>
        <span>CC CCTV Node</span>
        <span>·</span>
        <span>SL Lighting</span>
      </div>
    </div>
  );
};
