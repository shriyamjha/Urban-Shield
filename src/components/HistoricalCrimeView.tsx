import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  CityPoi,
  CrimeCategoryType,
  CrimeGranularity,
  HistoricalCrimeRecord,
  MapLayerCategory,
} from '../types/urbanshield.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import { InteractiveCityMap } from './InteractiveCityMap.tsx';
import { ExpandableDetails, DetailDrawer } from './ui/ProgressivePrimitives.tsx';

interface HistoricalCrimeViewProps {
  userLocation: { lat: number; lng: number };
  pois: CityPoi[];
}

const CRIME_CATEGORIES: CrimeCategoryType[] = [
  'All Recorded IPC/BNS Offences',
  'Theft & Snatching',
  'Vehicle Burglary / MV Theft',
  'Nighttime Street Offences',
  'Assault & Public Order',
  'Women Safety & Harassment',
];

const GRANULARITY_LABELS: Record<CrimeGranularity, string> = {
  district: 'District Aggregate (NCRB)',
  police_station: 'Police Station Jurisdiction',
  sector_locality: 'Sector / Locality',
  insufficient_data: 'Insufficient Granular Data',
};

export const HistoricalCrimeView: React.FC<HistoricalCrimeViewProps> = ({
  userLocation,
  pois,
}) => {
  const [selectedYear, setSelectedYear] = useState<'all' | 2021 | 2022 | 2023 | 2024>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | CrimeCategoryType>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<
    'all' | 'Chandigarh UT' | 'SAS Nagar (Mohali)'
  >('all');
  const [selectedGranularity, setSelectedGranularity] = useState<'all' | CrimeGranularity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<HistoricalCrimeRecord | null>(null);
  const [showPoliceLayer, setShowPoliceLayer] = useState(true);
  const [showCctvLayer, setShowCctvLayer] = useState(false);

  const filteredRecords = useMemo(() => {
    return HISTORICAL_CRIME_DATABASE.filter((rec) => {
      if (selectedYear !== 'all' && rec.year !== selectedYear) return false;
      if (selectedCategory !== 'all' && rec.crimeCategory !== selectedCategory) return false;
      if (selectedDistrict !== 'all' && rec.district !== selectedDistrict) return false;
      if (selectedGranularity !== 'all' && rec.geographicGranularity !== selectedGranularity) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${rec.policeStation} ${rec.sectorOrLocality} ${rec.district} ${rec.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selectedYear, selectedCategory, selectedDistrict, selectedGranularity, searchQuery]);

  // Records suitable for spatial jurisdiction heatmap (only police_station granularity, never district aggregates)
  const spatialJurisdictionRecords = useMemo(() => {
    return filteredRecords.filter(
      (r) =>
        r.geographicGranularity === 'police_station' &&
        r.incidentCount !== null &&
        r.latitude !== undefined &&
        r.longitude !== undefined
    );
  }, [filteredRecords]);

  // Year-over-Year comparison by Police Station & Category
  const yoyComparisonRows = useMemo(() => {
    const psSet = Array.from(
      new Set(
        HISTORICAL_CRIME_DATABASE.filter(
          (r) => r.geographicGranularity === 'police_station' && r.incidentCount !== null
        ).map(
          (r) => `${r.policeStation}|||${r.crimeCategory}|||${r.sectorOrLocality}|||${r.district}`
        )
      )
    );

    return psSet
      .map((key) => {
        const [ps, cat, sector, district] = key.split('|||');
        const records = HISTORICAL_CRIME_DATABASE.filter(
          (r) => r.policeStation === ps && r.crimeCategory === (cat as CrimeCategoryType)
        );
        const y2022 = records.find((r) => r.year === 2022)?.incidentCount ?? null;
        const y2023 = records.find((r) => r.year === 2023)?.incidentCount ?? null;
        const y2024 = records.find((r) => r.year === 2024)?.incidentCount ?? null;

        let deltaPct: number | null = null;
        if (y2022 !== null && y2023 !== null && y2022 > 0) {
          deltaPct = Math.round(((y2023 - y2022) / y2022) * 100);
        }

        return {
          policeStation: ps,
          category: cat as CrimeCategoryType,
          sectorOrLocality: sector,
          district,
          y2022,
          y2023,
          y2024,
          deltaPct,
        };
      })
      .filter((row) => {
        if (selectedDistrict !== 'all' && row.district !== selectedDistrict) return false;
        if (selectedCategory !== 'all' && row.category !== selectedCategory) return false;
        return true;
      });
  }, [selectedDistrict, selectedCategory]);

  const mapActiveLayers = useMemo(() => {
    const s = new Set<MapLayerCategory>(['crime_hotspot']);
    if (showPoliceLayer) s.add('police');
    if (showCctvLayer) s.add('cctv');
    return s;
  }, [showPoliceLayer, showCctvLayer]);

  const mapCenter: [number, number] = useMemo(() => {
    if (selectedRecord?.longitude && selectedRecord?.latitude) {
      return [selectedRecord.longitude, selectedRecord.latitude];
    }
    return [userLocation.lng, userLocation.lat];
  }, [selectedRecord, userLocation]);

  return (
    <div className="space-y-5">
      {/* Calm Header + Small Summary of Available Historical Records */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="urbanshield-heading-enter">
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F5F7FA] tracking-tight">
            Historical Crime Intelligence
          </h1>
          <p className="text-xs text-[#929AA5] mt-1">
            2021–2024 Police Station jurisdictional records and NCRB district archives. Select any jurisdiction on the map to inspect details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[#929AA5]">
          <div className="px-3 py-1.5 rounded-lg bg-[#0A0C0F] border border-white/[0.06]">
            Records matched:{' '}
            <span className="font-mono font-medium text-[#F5F7FA] tabular-nums">
              {filteredRecords.length}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#0A0C0F] border border-white/[0.06]">
            Mapped jurisdictions:{' '}
            <span className="font-mono font-medium text-[#F59E0B] tabular-nums">
              {spatialJurisdictionRecords.length}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Filter Bar */}
      <div className="urbanshield-card-enter stagger-1 bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Year Selector */}
        <div className="flex items-center gap-1 bg-[#101317] border border-white/[0.06] rounded-lg p-1 shrink-0">
          {(['all', 2024, 2023, 2022, 2021] as const).map((yr) => (
            <button
              key={String(yr)}
              type="button"
              onClick={() => setSelectedYear(yr)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                selectedYear === yr
                  ? 'bg-[#15191E] text-[#00D9F5] border border-[#00D9F5]/30 font-medium'
                  : 'text-[#929AA5] hover:text-[#F5F7FA]'
              }`}
            >
              {yr === 'all' ? 'All Years' : yr}
            </button>
          ))}
        </div>

        {/* Crime Category & Geographic Filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as 'all' | CrimeCategoryType)}
            aria-label="Crime Category"
            className="bg-[#101317] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]/50"
          >
            <option value="all">All Crime Categories</option>
            {CRIME_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={selectedDistrict}
            onChange={(e) =>
              setSelectedDistrict(
                e.target.value as 'all' | 'Chandigarh UT' | 'SAS Nagar (Mohali)'
              )
            }
            aria-label="Geographic Jurisdiction"
            className="bg-[#101317] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]/50"
          >
            <option value="all">All Jurisdictions (CHD & Mohali)</option>
            <option value="Chandigarh UT">Chandigarh UT</option>
            <option value="SAS Nagar (Mohali)">SAS Nagar (Mohali)</option>
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-[#929AA5] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter station or sector..."
              className="w-full bg-[#101317] border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#F5F7FA] placeholder:text-[#929AA5] focus:outline-none focus:border-[#00D9F5]/50"
            />
          </div>
        </div>

        {/* Minimal Map Overlay Toggles */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPoliceLayer(!showPoliceLayer)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              showPoliceLayer
                ? 'bg-[#15191E] border-[#00D9F5]/40 text-[#00D9F5]'
                : 'bg-[#101317] border-white/[0.06] text-[#929AA5] hover:text-[#F5F7FA]'
            }`}
          >
            Police Stations
          </button>
          <button
            type="button"
            onClick={() => setShowCctvLayer(!showCctvLayer)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              showCctvLayer
                ? 'bg-[#15191E] border-[#00D9F5]/40 text-[#00D9F5]'
                : 'bg-[#101317] border-white/[0.06] text-[#929AA5] hover:text-[#F5F7FA]'
            }`}
          >
            CCTV Nodes
          </button>
        </div>
      </div>

      {/* Main Crime Map + Contextual Detail Drawer when a Jurisdiction is Selected */}
      <div className="urbanshield-card-enter stagger-2 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div
          className={`${
            selectedRecord ? 'lg:col-span-8' : 'lg:col-span-12'
          } bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-2 transition-all duration-200`}
        >
          <InteractiveCityMap
            center={mapCenter}
            zoom={12}
            userLocation={userLocation}
            pois={pois}
            reports={[]}
            sosIncidents={[]}
            activeLayers={mapActiveLayers}
            selectedPoi={null}
            onSelectPoi={() => {}}
            crimeRecords={spatialJurisdictionRecords}
            onSelectCrimeRecord={(rec) => setSelectedRecord(rec)}
            heightClass="h-[520px]"
          />
          <div className="px-2 pt-2 pb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#929AA5]">
            <span>
              Jurisdiction circles represent Police Station boundaries (1.3–1.65 km radius), not exact street-corner pins.
            </span>
            <span>Click any jurisdiction circle on the map to inspect its record</span>
          </div>
        </div>

        {selectedRecord && (
          <div className="lg:col-span-4">
            <DetailDrawer
              open={Boolean(selectedRecord)}
              onClose={() => setSelectedRecord(null)}
              title={selectedRecord.policeStation}
              subtitle={`${selectedRecord.sectorOrLocality} · ${selectedRecord.district}`}
              badge={
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#15191E] border border-white/[0.08] text-[10px] font-mono text-[#00D9F5]">
                  {GRANULARITY_LABELS[selectedRecord.geographicGranularity]}
                </span>
              }
            >
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-[#0A0C0F] border border-white/[0.06] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-[#929AA5]">{selectedRecord.crimeCategory}</div>
                    <div className="text-xs font-medium text-[#F5F7FA] mt-0.5">
                      Reporting Year {selectedRecord.year}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-base font-semibold text-[#F59E0B] tabular-nums">
                      {selectedRecord.incidentCount !== null
                        ? `${selectedRecord.incidentCount.toLocaleString()} FIRs`
                        : 'Insufficient Data'}
                    </div>
                    <div className="text-[10px] text-emerald-400 uppercase">
                      {selectedRecord.verificationStatus}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#929AA5] leading-relaxed">{selectedRecord.notes}</p>

                <div className="pt-2 border-t border-white/[0.06] space-y-1 text-[11px] text-[#929AA5]">
                  <div>
                    <span className="text-[#F5F7FA]">Source:</span> {selectedRecord.source}
                  </div>
                  <div>
                    <span className="text-[#F5F7FA]">Granularity:</span>{' '}
                    {GRANULARITY_LABELS[selectedRecord.geographicGranularity]}
                  </div>
                </div>
              </div>
            </DetailDrawer>
          </div>
        )}
      </div>

      {/* Progressive Disclosure: Show Data Details & View Methodology */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
        <ExpandableDetails
          label={`Show data details (${filteredRecords.length} archival records & YoY table)`}
          collapseLabel="Hide data details"
          badge={`${filteredRecords.length} records`}
        >
          <div className="space-y-5">
            {/* Granularity Filter inside Data Details */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-[#F5F7FA]">
                Individual Archival Records ({filteredRecords.length})
              </span>
              <select
                value={selectedGranularity}
                onChange={(e) => setSelectedGranularity(e.target.value as 'all' | CrimeGranularity)}
                className="bg-[#0A0C0F] border border-white/[0.06] rounded-lg px-2.5 py-1 text-[11px] text-[#F5F7FA]"
              >
                <option value="all">All Granularity Levels</option>
                <option value="police_station">Police Station Jurisdiction</option>
                <option value="district">District-Level Aggregate (Non-Spatial)</option>
                <option value="insufficient_data">Insufficient Disaggregated Data</option>
              </select>
            </div>

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {filteredRecords.map((rec) => {
                const isSelected = selectedRecord?.id === rec.id;
                const isInsufficient = rec.geographicGranularity === 'insufficient_data';
                const isDistrict = rec.geographicGranularity === 'district';

                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedRecord(rec)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-[#15191E] border-[#00D9F5]/50'
                        : 'bg-[#0A0C0F] hover:bg-[#15191E]/70 border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-[#15191E] border border-white/[0.06] text-[10px] font-mono text-[#F5F7FA]">
                          {rec.year}
                        </span>
                        <span className="text-xs font-medium text-[#F5F7FA] truncate">
                          {rec.policeStation}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-mono font-medium tabular-nums shrink-0 ${
                          isInsufficient
                            ? 'text-[#F59E0B]'
                            : isDistrict
                            ? 'text-[#00D9F5]'
                            : 'text-[#F5F7FA]'
                        }`}
                      >
                        {rec.incidentCount !== null
                          ? `${rec.incidentCount.toLocaleString()} FIRs`
                          : 'Insufficient Data'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#929AA5]">
                      <span>{rec.crimeCategory}</span>
                      <span className="font-mono text-[10px]">
                        {GRANULARITY_LABELS[rec.geographicGranularity]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Police Jurisdiction Multi-Year Comparison Table */}
            <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#F5F7FA]">
                  Police Jurisdiction Multi-Year Comparison
                </span>
                <span className="text-[10px] font-mono text-[#929AA5]">2022 vs 2023 FIRs</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] font-mono uppercase text-[#929AA5]">
                      <th className="py-2 pr-2">Station</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2 text-right">2022</th>
                      <th className="py-2 px-2 text-right">2023</th>
                      <th className="py-2 pl-2 text-right">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {yoyComparisonRows.map((row) => (
                      <tr
                        key={`${row.policeStation}-${row.category}`}
                        className="hover:bg-[#15191E]/50 transition-colors"
                      >
                        <td className="py-2 pr-2 font-medium text-[#F5F7FA]">
                          {row.policeStation}
                          <div className="text-[10px] text-[#929AA5] font-normal">
                            {row.sectorOrLocality}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-[#929AA5]">{row.category}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-[#929AA5]">
                          {row.y2022 !== null ? row.y2022 : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-medium tabular-nums text-[#F5F7FA]">
                          {row.y2023 !== null ? row.y2023 : '—'}
                        </td>
                        <td className="py-2 pl-2 text-right font-mono tabular-nums">
                          {row.deltaPct === null ? (
                            <span className="text-[#929AA5]">—</span>
                          ) : row.deltaPct < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-400">
                              <TrendingDown className="w-3 h-3" />
                              {row.deltaPct}%
                            </span>
                          ) : row.deltaPct > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[#F59E0B]">
                              <TrendingUp className="w-3 h-3" />+{row.deltaPct}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[#929AA5]">
                              <Minus className="w-3 h-3" />
                              0%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ExpandableDetails>

        <ExpandableDetails
          label="View methodology & data provenance"
          collapseLabel="Hide methodology"
        >
          <div className="space-y-3 text-xs text-[#929AA5] leading-relaxed">
            <div className="flex items-center gap-2 text-[#F5F7FA] font-medium">
              <ShieldAlert className="w-4 h-4 text-[#00D9F5]" />
              <span>Geographic Granularity & Epistemic Integrity</span>
            </div>
            <p>
              Historical records are compiled strictly from published National Crime Records Bureau (NCRB) <em>Crime in India</em> district tables and Chandigarh / SAS Nagar (Mohali) Police Station statistical disclosures.
            </p>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                <strong className="text-[#F5F7FA]">District Aggregates:</strong> City-wide NCRB totals are preserved as non-spatial records and are never plotted as synthetic sector pins.
              </li>
              <li>
                <strong className="text-[#F5F7FA]">Police Station Jurisdictions:</strong> Rendered as boundary circles (1.3–1.65 km radius) corresponding to actual station coverage areas.
              </li>
              <li>
                <strong className="text-[#F5F7FA]">Insufficient Disaggregated Data:</strong> Localities without verified public station-level tables are explicitly marked rather than estimated.
              </li>
            </ul>
          </div>
        </ExpandableDetails>
      </div>
    </div>
  );
};
