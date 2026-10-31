import React from 'react';
import {
  CloudSun,
  Wind,
  Droplets,
  Eye,
  Clock,
  AlertCircle,
  RefreshCw,
  Building2,
  Bus,
} from 'lucide-react';
import { CityPoi, WeatherTelemetry } from '../types/urbanshield.ts';

interface CityConditionsViewProps {
  weather: WeatherTelemetry[];
  loading: boolean;
  onRefresh: () => void;
  pois: CityPoi[];
}

export const CityConditionsView: React.FC<CityConditionsViewProps> = ({
  weather,
  loading,
  onRefresh,
  pois,
}) => {
  const documentedHoursPois = pois.filter((p) => Boolean(p.openingHours));
  const transportStops = pois.filter((p) => p.category === 'transport');

  return (
    <div className="space-y-6">
      <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Environmental & Operational City Intelligence
          </h2>
          <p className="text-xs text-slate-400">
            Live meteorological data via Open-Meteo API for Chandigarh and SAS Nagar (Mohali),
            paired with verified OpenStreetMap operational hours.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-cyan-300 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing Open-Meteo...' : 'Refresh Live Telemetry'}</span>
        </button>
      </div>

      {/* Weather Cards for Chandigarh & Mohali */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {weather.map((w) => (
          <div
            key={w.city}
            className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono text-cyan-400">
                  {w.latitude.toFixed(4)}° N, {w.longitude.toFixed(4)}° E · Open-Meteo Live
                </div>
                <h3 className="font-display text-xl font-bold text-white mt-0.5">{w.city}</h3>
                <p className="text-xs text-slate-400">{w.weatherDescription}</p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-3xl font-bold text-white">{w.temperatureC.toFixed(1)}°C</div>
                <div className="text-xs text-slate-400">
                  Feels like {w.apparentTemperatureC.toFixed(1)}°C
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Rain Prob.</span>
                </div>
                <div className="mt-1 text-base font-mono font-semibold text-white tabular-nums">
                  {w.precipitationProbability}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Visibility</span>
                </div>
                <div className="mt-1 text-base font-mono font-semibold text-white tabular-nums">
                  {w.visibilityMeters !== null
                    ? `${(w.visibilityMeters / 1000).toFixed(1)} km`
                    : 'Not Reported'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Wind className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Wind Speed</span>
                </div>
                <div className="mt-1 text-base font-mono font-semibold text-white tabular-nums">
                  {w.windSpeedKmh} km/h
                </div>
              </div>
            </div>

            {/* Hourly Forecast Strip */}
            <div className="pt-2">
              <div className="text-xs text-slate-400 mb-2">
                Hourly Forecast (Temperature & Rain Probability)
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {w.hourlyForecast.map((h) => (
                  <div
                    key={h.time}
                    className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-center font-mono tabular-nums"
                  >
                    <div className="text-[10px] text-slate-400">
                      {h.time.split('T')[1]?.slice(0, 5) || h.time}
                    </div>
                    <div className="text-xs font-semibold text-white mt-0.5">{h.tempC}°</div>
                    <div className="text-[10px] text-cyan-400">{h.rainProb}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Honest Data Availability & Unintegrated Provider Disclosures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-white">
              Live Road Traffic Telemetry Status
            </span>
            <span className="text-xs font-mono text-amber-400">PROVIDER NOT INTEGRATED</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            No commercial live traffic congestion provider is currently configured. UrbanShield does
            not simulate or invent live traffic speeds. Travel time estimates in Smart Routes are
            derived from OpenStreetMap road classifications via OSRM.
          </p>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-white">
              Public Transport Availability (CTU & PRTC)
            </span>
            <span className="text-xs font-mono text-cyan-400">
              {transportStops.length} VERIFIED OSM TERMINALS/STOPS
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Real-time bus GPS vehicle telemetry is unavailable from public feeds. Static verified
            locations for ISBT Sector 17, ISBT Sector 43, Mohali Phase 6 Bus Stand, SAS Nagar
            Railway Station, and CTU corridor stops are mapped.
          </p>
        </div>
      </div>

      {/* Establishments with Documented Opening Hours */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-base font-bold text-white">
              Facilities with Verified Opening Hours ({documentedHoursPois.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Locations without OSM opening_hours tags are excluded to prevent fabrication
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {documentedHoursPois.map((poi) => (
            <div
              key={poi.id}
              className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase text-cyan-400">{poi.category}</span>
                <span className="font-mono text-emerald-400">{poi.openingHours}</span>
              </div>
              <div className="text-xs font-semibold text-white">{poi.name}</div>
              <div className="text-[11px] text-slate-400">
                {poi.address || 'Chandigarh / Mohali'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
