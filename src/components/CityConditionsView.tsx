import React from 'react';
import {
  Wind,
  Droplets,
  Eye,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { CityPoi, WeatherTelemetry } from '../types/urbanshield.ts';
import { ExpandableDetails } from './ui/ProgressivePrimitives.tsx';

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
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="urbanshield-heading-enter">
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F5F7FA] tracking-tight">
            City Conditions
          </h1>
          <p className="text-xs text-[#929AA5] mt-1">
            Live Open-Meteo conditions for Chandigarh and SAS Nagar (Mohali) alongside verified operational hours.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-xs font-medium text-[#00D9F5] cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Conditions'}</span>
        </button>
      </div>

      {/* Weather Cards for Chandigarh & Mohali */}
      <div className="urbanshield-card-enter stagger-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {weather.map((w) => (
          <div
            key={w.city}
            className="bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F5F7FA]">{w.city}</h2>
                <p className="text-xs text-[#929AA5] mt-0.5">{w.weatherDescription}</p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-2xl font-semibold text-[#F5F7FA]">
                  {w.temperatureC.toFixed(1)}°C
                </div>
                <div className="text-[11px] text-[#929AA5]">
                  Feels like {w.apparentTemperatureC.toFixed(1)}°C
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-lg bg-[#101317] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#929AA5]">
                  <Droplets className="w-3.5 h-3.5 text-[#00D9F5]" />
                  <span>Rain Prob.</span>
                </div>
                <div className="mt-1 text-sm font-mono font-semibold text-[#F5F7FA] tabular-nums">
                  {w.precipitationProbability}%
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#101317] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#929AA5]">
                  <Eye className="w-3.5 h-3.5 text-[#00D9F5]" />
                  <span>Visibility</span>
                </div>
                <div className="mt-1 text-sm font-mono font-semibold text-[#F5F7FA] tabular-nums">
                  {w.visibilityMeters !== null
                    ? `${(w.visibilityMeters / 1000).toFixed(1)} km`
                    : 'N/A'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#101317] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-[11px] text-[#929AA5]">
                  <Wind className="w-3.5 h-3.5 text-[#00D9F5]" />
                  <span>Wind</span>
                </div>
                <div className="mt-1 text-sm font-mono font-semibold text-[#F5F7FA] tabular-nums">
                  {w.windSpeedKmh} km/h
                </div>
              </div>
            </div>

            {/* Hourly Forecast Strip */}
            <div className="pt-1">
              <div className="text-[11px] text-[#929AA5] mb-2">Hourly Forecast</div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {w.hourlyForecast.map((h) => (
                  <div
                    key={h.time}
                    className="p-2 rounded-lg bg-[#101317] border border-white/[0.05] text-center font-mono tabular-nums"
                  >
                    <div className="text-[10px] text-[#929AA5]">
                      {h.time.split('T')[1]?.slice(0, 5) || h.time}
                    </div>
                    <div className="text-xs font-medium text-[#F5F7FA] mt-0.5">{h.tempC}°</div>
                    <div className="text-[10px] text-[#00D9F5]">{h.rainProb}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progressive Disclosure for Verified Opening Hours & Provider Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExpandableDetails
          label={`Explore verified operating hours (${documentedHoursPois.length} facilities)`}
          collapseLabel="Hide operating hours"
          badge={`${documentedHoursPois.length} POIs`}
        >
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            <div className="flex items-center gap-2 text-xs text-[#929AA5] pb-1">
              <Building2 className="w-3.5 h-3.5 text-[#00D9F5]" />
              <span>Locations with verified OpenStreetMap opening_hours tags</span>
            </div>
            {documentedHoursPois.map((poi) => (
              <div
                key={poi.id}
                className="p-3 rounded-lg bg-[#0A0C0F] border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#F5F7FA] truncate">{poi.name}</div>
                  <div className="text-[11px] text-[#929AA5] truncate">
                    {poi.address || 'Chandigarh / Mohali'}
                  </div>
                </div>
                <span className="font-mono text-[11px] text-emerald-400 shrink-0">
                  {poi.openingHours}
                </span>
              </div>
            ))}
          </div>
        </ExpandableDetails>

        <ExpandableDetails
          label="Show traffic & public transport data status"
          collapseLabel="Hide data status"
        >
          <div className="space-y-3 text-xs text-[#929AA5] leading-relaxed">
            <div>
              <div className="font-medium text-[#F5F7FA] mb-0.5">
                Road Traffic Telemetry
              </div>
              <p>
                No commercial live traffic congestion feed is integrated. Smart Routes travel times are computed directly from OpenStreetMap road classifications via OSRM without synthetic congestion scores.
              </p>
            </div>
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="font-medium text-[#F5F7FA] mb-0.5">
                Public Transport ({transportStops.length} mapped terminals/stops)
              </div>
              <p>
                Static verified locations for ISBT Sector 17, ISBT Sector 43, Mohali Phase 6 Bus Stand, SAS Nagar Railway Station, and CTU corridor stops are available.
              </p>
            </div>
          </div>
        </ExpandableDetails>
      </div>
    </div>
  );
};
