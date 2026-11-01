import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Navigation,
  MapPin,
  Phone,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Crosshair,
  X,
} from 'lucide-react';
import {
  CityPoi,
  CommunityReport,
  MapLayerCategory,
  SosIncident,
} from '../types/urbanshield.ts';
import { InteractiveCityMap, CATEGORY_STYLE_MAP } from './InteractiveCityMap.tsx';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import {
  GeocodingSuggestion,
  searchLocationsCached,
} from '../services/gisClientService.ts';
import {
  AnimatedPanel,
  DetailDrawer,
  ExpandableDetails,
  CompactMetric,
} from './ui/ProgressivePrimitives.tsx';

interface CityMapViewProps {
  userLocation: { lat: number; lng: number };
  onRequestBrowserLocation: () => void;
  pois: CityPoi[];
  reports: CommunityReport[];
  sosIncidents: SosIncident[];
  onNavigateToPoi: (poi: CityPoi) => void;
}

export const LAYER_DEFINITIONS: Array<{
  id: MapLayerCategory;
  label: string;
  colorHex: string;
  primary?: boolean;
}> = [
  { id: 'hospital', label: 'Hospitals', colorHex: '#FF4148', primary: true },
  { id: 'pharmacy', label: 'Pharmacies', colorHex: '#10B981', primary: true },
  { id: 'police', label: 'Police', colorHex: '#3B82F6', primary: true },
  { id: 'fuel', label: 'Petrol pumps', colorHex: '#F59E0B', primary: true },
  { id: 'transport', label: 'Public transport', colorHex: '#00D9F5', primary: true },
  { id: 'restaurant', label: 'Restaurants', colorHex: '#F97316' },
  { id: 'shop', label: 'Shops', colorHex: '#A855F7' },
  { id: 'cctv', label: 'CCTV', colorHex: '#14B8A6' },
  { id: 'streetlight', label: 'Streetlights', colorHex: '#FACC15' },
  { id: 'education', label: 'Educational institutions', colorHex: '#6366F1' },
  { id: 'clinic', label: 'Clinics', colorHex: '#F87171' },
  { id: 'cafe', label: 'Cafes', colorHex: '#FB923C' },
  { id: 'incident', label: 'Community reports', colorHex: '#E11D48' },
  { id: 'crime_hotspot', label: 'Crime hotspots', colorHex: '#DC2626' },
];

const SAVED_LAYERS_STORAGE_KEY = 'urbanshield_city_map_layers_v2';

export const CityMapView: React.FC<CityMapViewProps> = ({
  userLocation,
  onRequestBrowserLocation,
  pois,
  reports,
  sosIncidents,
  onNavigateToPoi,
}) => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    userLocation.lng,
    userLocation.lat,
  ]);
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Default to only 3 core emergency categories so the map is calm and uncluttered.
  // Remember user's selected layers in localStorage.
  const [activeLayers, setActiveLayers] = useState<Set<MapLayerCategory>>(() => {
    try {
      const saved = localStorage.getItem(SAVED_LAYERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as MapLayerCategory[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Set(parsed);
        }
      }
    } catch {
      // Ignore storage error
    }
    return new Set<MapLayerCategory>(['hospital', 'police', 'pharmacy']);
  });

  // Show facility details ONLY when a marker is selected
  const [selectedPoi, setSelectedPoi] = useState<CityPoi | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_LAYERS_STORAGE_KEY, JSON.stringify(Array.from(activeLayers)));
    } catch {
      // Ignore storage error
    }
  }, [activeLayers]);

  // Debounced geocoding autocomplete
  useEffect(() => {
    const clean = searchQuery.trim();
    if (clean.length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await searchLocationsCached(clean, ctrl.signal);
      setSuggestions(res);
    }, 280);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery]);

  const toggleLayer = (cat: MapLayerCategory) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const enrichedPois = useMemo(() => {
    return pois
      .map((p) => ({
        ...p,
        distanceKm: Number(
          haversineDistanceKm(
            userLocation.lat,
            userLocation.lng,
            p.latitude,
            p.longitude
          ).toFixed(2)
        ),
      }))
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  }, [pois, userLocation]);

  const filteredListPois = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedPois.filter((p) => {
      if (!activeLayers.has(p.category)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
      );
    });
  }, [enrichedPois, activeLayers, searchQuery]);

  const selectedPoiDistanceKm = selectedPoi
    ? haversineDistanceKm(
        userLocation.lat,
        userLocation.lng,
        selectedPoi.latitude,
        selectedPoi.longitude
      ).toFixed(2)
    : null;

  const primaryLayers = LAYER_DEFINITIONS.filter((l) => l.primary);
  const extendedLayers = LAYER_DEFINITIONS.filter((l) => !l.primary);

  return (
    <div className="space-y-5">
      {/* Header + Compact Search Bar + Minimal Category Selector */}
      <div className="space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="urbanshield-heading-enter font-display text-2xl font-semibold text-[#F5F7FA]">
              City Intelligence
            </h1>
            <p className="urbanshield-subtext-enter text-xs text-[#929AA5]">
              Select categories to inspect verified facilities across Chandigarh and Mohali
            </p>
          </div>

          {/* Compact Search Bar + My GPS */}
          <div className="urbanshield-subtext-enter flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="w-3.5 h-3.5 text-[#929AA5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sectors, hospitals, landmarks..."
                className="w-full bg-[#101317] border border-white/[0.08] focus:border-[#00D9F5] rounded-xl pl-9 pr-8 py-2 text-xs text-[#F5F7FA] placeholder:text-[#929AA5]/60 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Autocomplete Dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#101317] border border-white/[0.1] rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-white/[0.05]">
                  {suggestions.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => {
                        setMapCenter([res.longitude, res.latitude]);
                        setMapZoom(15);
                        setSelectedPoi({
                          id: `search-${res.id}`,
                          name: res.name.split(',')[0],
                          category: 'shop',
                          latitude: res.latitude,
                          longitude: res.longitude,
                          address: res.name,
                          source: 'OpenStreetMap / Overpass API',
                          verified: true,
                        });
                        setSuggestions([]);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-[#15191E] flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <span className="text-[#F5F7FA] truncate">{res.name}</span>
                      <span className="text-[10px] font-mono text-[#00D9F5] shrink-0">
                        {res.latitude.toFixed(3)}, {res.longitude.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onRequestBrowserLocation();
                setMapCenter([userLocation.lng, userLocation.lat]);
                setMapZoom(14);
              }}
              className="urbanshield-interactive-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] whitespace-nowrap cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5 text-[#00D9F5]" />
              <span>My GPS</span>
            </button>
          </div>
        </div>

        {/* Minimal Category Selector + Expandable Map Layers */}
        <AnimatedPanel stagger={1} className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {primaryLayers.map((layer) => {
              const active = activeLayers.has(layer.id);
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => toggleLayer(layer.id)}
                  className={`urbanshield-interactive-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                    active
                      ? 'bg-[#15191E] border-[#00D9F5]/50 text-[#F5F7FA]'
                      : 'bg-[#0A0C0F] border-white/[0.06] text-[#929AA5] hover:text-[#F5F7FA]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: layer.colorHex }}
                  />
                  <span>{layer.label}</span>
                </button>
              );
            })}

            <ExpandableDetails
              label="Expand map layers"
              openLabel="Fewer layers"
              badge={`${activeLayers.size} active`}
              variant="pill"
              className="inline-block"
              contentClassName="pt-2.5"
            >
              <div className="p-3.5 rounded-2xl bg-[#0A0C0F] border border-white/[0.06] space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {extendedLayers.map((layer) => {
                    const active = activeLayers.has(layer.id);
                    const code = CATEGORY_STYLE_MAP[layer.id]?.shortCode || '•';
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => toggleLayer(layer.id)}
                        className={`urbanshield-interactive-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                          active
                            ? 'bg-[#15191E] border-[#00D9F5]/50 text-[#F5F7FA]'
                            : 'bg-[#101317] border-white/[0.06] text-[#929AA5] hover:text-[#F5F7FA]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full text-[8px] font-mono font-bold text-[#050607] flex items-center justify-center"
                          style={{ backgroundColor: layer.colorHex }}
                        >
                          {code}
                        </span>
                        <span>{layer.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.05] text-[11px] text-[#929AA5]">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLayers(new Set(['hospital', 'police', 'pharmacy']))
                    }
                    className="hover:text-[#F5F7FA] cursor-pointer"
                  >
                    Reset to essential
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLayers(
                        new Set(['cctv', 'streetlight', 'transport', 'fuel', 'police'])
                      )
                    }
                    className="hover:text-[#F5F7FA] cursor-pointer"
                  >
                    CCTV &amp; lighting
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLayers(new Set(LAYER_DEFINITIONS.map((l) => l.id)))
                    }
                    className="text-[#00D9F5] hover:underline cursor-pointer"
                  >
                    Show all 14 layers
                  </button>
                </div>
              </div>
            </ExpandableDetails>
          </div>
        </AnimatedPanel>
      </div>

      {/* Main Viewport: Prominent Map + Contextual Selected Marker Drawer (shown ONLY when a marker is selected) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <AnimatedPanel
          stagger={2}
          className={selectedPoi ? 'lg:col-span-8' : 'lg:col-span-12'}
        >
          <InteractiveCityMap
            center={mapCenter}
            zoom={mapZoom}
            userLocation={userLocation}
            pois={enrichedPois}
            reports={reports}
            sosIncidents={sosIncidents}
            crimeRecords={
              activeLayers.has('crime_hotspot') ? HISTORICAL_CRIME_DATABASE : []
            }
            activeLayers={activeLayers}
            selectedPoi={selectedPoi}
            onSelectPoi={(poi) => setSelectedPoi(poi)}
            heightClass="h-[540px] lg:h-[600px]"
          />
        </AnimatedPanel>

        {/* Contextual Facility Detail Panel — Rendered ONLY when a marker is selected */}
        {selectedPoi && (
          <div className="lg:col-span-4">
            <DetailDrawer
              open={Boolean(selectedPoi)}
              onClose={() => setSelectedPoi(null)}
              eyebrow={selectedPoi.category}
              title={selectedPoi.name}
              subtitle={
                selectedPoiDistanceKm ? `${selectedPoiDistanceKm} km from your location` : undefined
              }
            >
              <div className="space-y-4 text-xs">
                <div className="space-y-2 text-[#929AA5]">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#929AA5] shrink-0 mt-0.5" />
                    <span className="text-[#F5F7FA]">
                      {selectedPoi.address || 'Chandigarh / Mohali'}
                    </span>
                  </div>

                  {selectedPoi.openingHours && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#929AA5] shrink-0" />
                      <span>{selectedPoi.openingHours}</span>
                    </div>
                  )}

                  {selectedPoi.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[#929AA5] shrink-0" />
                      <span className="font-mono">{selectedPoi.phone}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateToPoi(selectedPoi)}
                  className="urbanshield-interactive-btn w-full py-2.5 px-4 rounded-xl bg-[#00D9F5] hover:bg-[#00D9F5]/90 text-[#050607] font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Calculate route here</span>
                </button>

                {/* Progressive Disclosure: Source information, verification status, coordinates & extended metadata */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <ExpandableDetails
                    label="More information"
                    openLabel="Less information"
                    variant="minimal"
                    contentClassName="pt-3 space-y-2 text-[11px] text-[#929AA5]"
                  >
                    <div className="flex items-center gap-1.5">
                      {selectedPoi.verified ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      )}
                      <span>
                        {selectedPoi.verified ? 'Verified record' : 'Unverified record'} ·{' '}
                        {selectedPoi.source}
                      </span>
                    </div>

                    <div className="font-mono text-[#929AA5]">
                      Coordinates: {selectedPoi.latitude.toFixed(5)}° N,{' '}
                      {selectedPoi.longitude.toFixed(5)}° E
                    </div>

                    {selectedPoi.coverageNote && (
                      <div className="p-2.5 rounded-lg bg-[#15191E] text-[#F59E0B] leading-relaxed">
                        {selectedPoi.coverageNote}
                      </div>
                    )}
                  </ExpandableDetails>
                </div>
              </div>
            </DetailDrawer>
          </div>
        )}
      </div>

      {/* Progressive Disclosure: Directory & Infrastructure Methodology hidden until requested */}
      <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-4">
        <ExpandableDetails
          label="Explore data"
          openLabel="Hide directory"
          badge={`${filteredListPois.length} locations`}
          variant="minimal"
          className="w-full"
          contentClassName="pt-4 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {filteredListPois.map((poi) => (
              <button
                key={poi.id}
                type="button"
                onClick={() => {
                  setSelectedPoi(poi);
                  setMapCenter([poi.longitude, poi.latitude]);
                }}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  selectedPoi?.id === poi.id
                    ? 'bg-[#15191E] border-[#00D9F5]/50'
                    : 'bg-[#0A0C0F] hover:bg-[#101317] border-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#F5F7FA] truncate">{poi.name}</span>
                  <span className="font-mono text-[11px] text-[#00D9F5] tabular-nums shrink-0">
                    {poi.distanceKm} km
                  </span>
                </div>
                <div className="text-[11px] text-[#929AA5] truncate mt-0.5 capitalize">
                  {poi.category} · {poi.address || 'Chandigarh / Mohali'}
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-[#0A0C0F] border border-white/[0.06] space-y-2 text-xs text-[#929AA5]">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <CompactMetric
                label="ICCC & OSM CCTV Nodes"
                value={pois.filter((p) => p.category === 'cctv').length}
                accent="cyan"
              />
              <CompactMetric
                label="Mapped Lighting Corridors"
                value={pois.filter((p) => p.category === 'streetlight').length}
                accent="amber"
              />
            </div>
            <p className="text-[11px] leading-relaxed">
              Chandigarh Smart City ICCC operates intersection surveillance across primary V2/V3
              arterial roads. OpenStreetMap does not map every individual camera or streetlamp pole;
              unmapped internal sector lanes indicate partial public records rather than confirmed
              absence of lighting or cameras.
            </p>
          </div>
        </ExpandableDetails>
      </div>
    </div>
  );
};
