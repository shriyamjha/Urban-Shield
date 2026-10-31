import React, { useMemo } from 'react';
import {
  MapPin,
  Navigation,
  Siren,
  CloudSun,
  AlertTriangle,
  Building2,
  ArrowRight,
  Crosshair,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import {
  CityPoi,
  CommunityReport,
  MapLayerCategory,
  NavigationSection,
  SosIncident,
  WeatherTelemetry,
} from '../types/urbanshield.ts';
import { InteractiveCityMap } from './InteractiveCityMap.tsx';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface OverviewDashboardViewProps {
  userLocation: { lat: number; lng: number };
  onRequestBrowserLocation: () => void;
  pois: CityPoi[];
  reports: CommunityReport[];
  sosIncidents: SosIncident[];
  weather: WeatherTelemetry[];
  onNavigateSection: (sec: NavigationSection) => void;
  onRouteToPoi: (poi: CityPoi) => void;
  onTriggerSosModal: () => void;
}

export const OverviewDashboardView: React.FC<OverviewDashboardViewProps> = ({
  userLocation,
  onRequestBrowserLocation,
  pois,
  reports,
  sosIncidents,
  weather,
  onNavigateSection,
  onRouteToPoi,
  onTriggerSosModal,
}) => {
  const { user, contacts } = useAuth();

  const nearestEssentials = useMemo(() => {
    return pois
      .filter((p) => ['hospital', 'police', 'pharmacy', 'fuel', 'transport'].includes(p.category))
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
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
      .slice(0, 6);
  }, [pois, userLocation]);

  const activeMapLayers = useMemo(
    () =>
      new Set<MapLayerCategory>([
        'hospital',
        'pharmacy',
        'police',
        'transport',
        'cctv',
        'streetlight',
        'incident',
      ]),
    []
  );

  const chdWeather = weather[0];

  return (
    <div className="space-y-4">
      {/* Compact Situational Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Active GPS Anchor */}
        <div className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#8A909E]">
            <span>GPS TELEMETRY</span>
            <button
              type="button"
              onClick={onRequestBrowserLocation}
              className="text-[#00D2FF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Crosshair className="w-3 h-3" />
              <span>SYNC</span>
            </button>
          </div>
          <div className="mt-1.5 font-mono text-sm font-bold text-white tabular-nums">
            {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
          </div>
          <div className="mt-1 text-[11px] text-[#8A909E] flex items-center justify-between">
            <span>Corridor: {user?.defaultCity || 'Chandigarh & Mohali'}</span>
            <span className="font-mono text-emerald-400">{pois.length} Verified Nodes</span>
          </div>
        </div>

        {/* 2. Smart Route Intelligence */}
        <button
          type="button"
          onClick={() => onNavigateSection('routes')}
          className="bg-[#111316] hover:bg-[#181A1F] border border-[#22262E] rounded-lg p-3.5 flex flex-col justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-mono text-[#8A909E]">
            <span>SMART ROUTE ENGINE</span>
            <Navigation className="w-3.5 h-3.5 text-[#F59E0B]" />
          </div>
          <div className="mt-1.5 font-display text-sm font-bold text-white">
            Recommended · Fastest · Activity
          </div>
          <div className="mt-1 text-[11px] text-[#F59E0B] flex items-center gap-1 font-mono">
            <span>Driving · Walking · Cycling OSRM</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </button>

        {/* 3. Historical Crime & Weather */}
        <button
          type="button"
          onClick={() => onNavigateSection('crime')}
          className="bg-[#111316] hover:bg-[#181A1F] border border-[#22262E] rounded-lg p-3.5 flex flex-col justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-mono text-[#8A909E]">
            <span>CRIME ARCHIVE & METEOROLOGY</span>
            <Flame className="w-3.5 h-3.5 text-[#F97316]" />
          </div>
          <div className="mt-1.5 font-mono text-sm font-bold text-white tabular-nums">
            {HISTORICAL_CRIME_DATABASE.length} Archival Records (2021–24)
          </div>
          <div className="mt-1 text-[11px] text-[#8A909E] font-mono tabular-nums truncate">
            {chdWeather
              ? `${chdWeather.temperatureC.toFixed(1)}°C · ${chdWeather.weatherDescription}`
              : 'NCRB & Police Station Granularity'}
          </div>
        </button>

        {/* 4. Emergency SOS Command */}
        <div className="bg-[#111316] border border-[#EF4444]/40 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-mono text-red-400">
            <span>EMERGENCY SOS</span>
            <span>{contacts.length} CONTACTS ARMED</span>
          </div>
          <button
            type="button"
            onClick={onTriggerSosModal}
            className="mt-2 w-full py-2 px-3 rounded bg-[#EF4444] hover:bg-red-500 text-white font-display font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Siren className="w-3.5 h-3.5" />
            <span>TRIGGER SOS COUNTDOWN</span>
          </button>
        </div>
      </div>

      {/* Main Split: Leaflet OpenStreetMap Command Map + Nearby Essential Services */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-8 bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Chandigarh & Mohali Live Leaflet + OpenStreetMap Overview
              </h2>
              <p className="text-[11px] text-[#8A909E]">
                Displaying verified emergency hospitals, police stations, 24/7 pharmacies, transit
                hubs, and documented CCTV/lighting corridors.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateSection('map')}
                className="text-xs font-mono text-[#00D2FF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>14-Layer City Intelligence</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <InteractiveCityMap
            center={[userLocation.lng, userLocation.lat]}
            userLocation={userLocation}
            pois={pois}
            reports={reports}
            sosIncidents={sosIncidents}
            activeLayers={activeMapLayers}
            selectedPoi={null}
            onSelectPoi={(poi) => onRouteToPoi(poi)}
            heightClass="h-[440px]"
          />
        </div>

        {/* Right: Nearest Verified Help Points */}
        <div className="lg:col-span-4 bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#00D2FF]" />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Nearest Documented Help Points
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#8A909E]">OSM VERIFIED</span>
            </div>

            <div className="space-y-2">
              {nearestEssentials.map((poi) => (
                <div
                  key={poi.id}
                  className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white truncate">{poi.name}</span>
                    <span className="font-mono tabular-nums text-[#00D2FF] shrink-0">
                      {poi.distanceKm} km
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#8A909E]">
                    <span className="font-mono">
                      {poi.category.toUpperCase()} · {poi.openingHours || 'Hours unverified'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRouteToPoi(poi)}
                      className="text-[#F59E0B] hover:underline font-mono font-medium cursor-pointer"
                    >
                      Route →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateSection('routes')}
            className="mt-3 w-full py-2 px-3 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-xs font-mono text-[#00D2FF] cursor-pointer"
          >
            Open Multi-Modal Smart Routes →
          </button>
        </div>
      </div>

      {/* Bottom: Community Safety & Infrastructure Reports */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Recent Community Infrastructure & Safety Reports
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('reports')}
            className="text-xs font-mono text-[#00D2FF] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage Reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {reports.slice(0, 4).map((rep) => (
            <div
              key={rep.id}
              className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A] flex flex-col justify-between space-y-2"
            >
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-[#00D2FF] uppercase">
                  {rep.verificationStatus.replace('_', ' ')} · {rep.confirmationsCount} confirms
                </div>
                <h4 className="font-display text-xs font-bold text-white line-clamp-2">
                  {rep.title}
                </h4>
                <p className="text-[11px] text-[#8A909E] line-clamp-2">{rep.description}</p>
              </div>
              <div className="pt-2 border-t border-[#22262E] text-[10px] font-mono text-[#8A909E] flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{rep.locationLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
