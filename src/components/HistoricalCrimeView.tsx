import React, { useState, useMemo } from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
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
  const [selectedRecord, setSelectedRecord] = useState<HistoricalCrimeRecord | null>(
    HISTORICAL_CRIME_DATABASE.find((r) => r.geographicGranularity === 'police_station') || null
  );
  const [showPoliceLayer, setShowPoliceLayer] = useState(true);
  const [showCctvLayer, setShowCctvLayer] = useState(true);

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
    <div className="space-y-4">
      {/* Data Integrity & Epistemic Disclosure Header */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#F97316]" />
            <h2 className="font-display text-sm font-bold text-white uppercase tracking-wider">
              Historical Crime Hotspot Intelligence (2021–2024 Archival Registry)
            </h2>
            <span className="px-2 py-0.5 rounded bg-[#181A1F] border border-[#2A2F3A] text-[10px] font-mono text-[#8A909E]">
              NO LIVE CRIME FEED CLAIMS
            </span>
          </div>
          <p className="text-xs text-[#8A909E] leading-relaxed max-w-4xl">
            Grounded strictly in published NCRB <em>Crime in India</em> district tables and
            Chandigarh / SAS Nagar Police Station jurisdictional summaries.{' '}
            <strong className="text-white">
              District-level aggregates are never plotted as fake sector pins
            </strong>
            , police-station statistics retain their jurisdictional boundary radius, and areas
            lacking disaggregated public tables are explicitly marked{' '}
            <strong className="text-[#F59E0B]">Insufficient Data</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 text-[11px] font-mono">
          <div className="px-2.5 py-1.5 rounded bg-[#181A1F] border border-[#22262E] text-slate-300">
            Records Matched: <span className="text-[#00D2FF] font-bold">{filteredRecords.length}</span>
          </div>
          <div className="px-2.5 py-1.5 rounded bg-[#181A1F] border border-[#22262E] text-slate-300">
            Mapped Jurisdictions:{' '}
            <span className="text-[#F97316] font-bold">{spatialJurisdictionRecords.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {/* Year Filter */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A909E] mb-1">
            Reporting Year
          </label>
          <div className="flex items-center bg-[#181A1F] border border-[#2A2F3A] rounded p-0.5">
            {(['all', 2024, 2023, 2022, 2021] as const).map((yr) => (
              <button
                key={String(yr)}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`flex-1 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-[#00D2FF] text-[#08090B] font-bold'
                    : 'text-[#8A909E] hover:text-white'
                }`}
              >
                {yr === 'all' ? 'All' : yr}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A909E] mb-1">
            Offence Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as 'all' | CrimeCategoryType)}
            className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D2FF]"
          >
            <option value="all">All Recorded Categories</option>
            {CRIME_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* District Filter */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A909E] mb-1">
            District Jurisdiction
          </label>
          <select
            value={selectedDistrict}
            onChange={(e) =>
              setSelectedDistrict(
                e.target.value as 'all' | 'Chandigarh UT' | 'SAS Nagar (Mohali)'
              )
            }
            className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D2FF]"
          >
            <option value="all">Chandigarh UT & SAS Nagar (Mohali)</option>
            <option value="Chandigarh UT">Chandigarh UT</option>
            <option value="SAS Nagar (Mohali)">SAS Nagar (Mohali)</option>
          </select>
        </div>

        {/* Granularity Filter */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A909E] mb-1">
            Geographic Granularity
          </label>
          <select
            value={selectedGranularity}
            onChange={(e) => setSelectedGranularity(e.target.value as 'all' | CrimeGranularity)}
            className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00D2FF]"
          >
            <option value="all">All Granularity Levels</option>
            <option value="police_station">Police Station Jurisdiction</option>
            <option value="district">District-Level Aggregate (Non-Spatial)</option>
            <option value="insufficient_data">Insufficient Disaggregated Data</option>
          </select>
        </div>

        {/* Search Input */}
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#8A909E] mb-1">
            Police Station / Sector Search
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g., PS Sector 17, Phase 1, Kharar..."
            className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-[#8A909E] focus:outline-none focus:border-[#00D2FF]"
          />
        </div>
      </div>

      {/* Main Split: Jurisdiction Heatmap + Selected Record & Granularity Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Interactive Jurisdiction Heatmap */}
        <div className="lg:col-span-7 bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Police Station Jurisdictional Exposure Map
              </h3>
              <p className="text-[11px] text-[#8A909E]">
                Circles represent Police Station jurisdictional boundaries (radius 1.3–1.65 km), NOT
                individual street-corner incident coordinates.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowPoliceLayer(!showPoliceLayer)}
                className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                  showPoliceLayer
                    ? 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#60A5FA]'
                    : 'bg-[#181A1F] border-[#2A2F3A] text-[#8A909E]'
                }`}
              >
                Police Stations
              </button>
              <button
                type="button"
                onClick={() => setShowCctvLayer(!showCctvLayer)}
                className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                  showCctvLayer
                    ? 'bg-[#14B8A6]/15 border-[#14B8A6]/50 text-[#2DD4BF]'
                    : 'bg-[#181A1F] border-[#2A2F3A] text-[#8A909E]'
                }`}
              >
                CCTV Nodes
              </button>
            </div>
          </div>

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
            heightClass="h-[460px]"
          />
        </div>

        {/* Right: Filtered Archival Records & Epistemic Granularity Inspector */}
        <div className="lg:col-span-5 bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
            <span className="text-xs font-display font-bold uppercase tracking-wider text-white">
              Archival Crime Records ({filteredRecords.length})
            </span>
            <span className="text-[10px] font-mono text-[#8A909E]">
              Click record to inspect granularity
            </span>
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {filteredRecords.map((rec) => {
              const isSelected = selectedRecord?.id === rec.id;
              const isInsufficient = rec.geographicGranularity === 'insufficient_data';
              const isDistrict = rec.geographicGranularity === 'district';

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => setSelectedRecord(rec)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-[#181A1F] border-[#00D2FF]'
                      : 'bg-[#08090B] hover:bg-[#181A1F]/70 border-[#22262E]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#181A1F] border border-[#2A2F3A] text-[10px] font-mono font-bold text-white">
                        {rec.year}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">
                        {rec.policeStation}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold tabular-nums shrink-0 ${
                        isInsufficient
                          ? 'text-[#F59E0B]'
                          : isDistrict
                          ? 'text-[#00D2FF]'
                          : 'text-[#F97316]'
                      }`}
                    >
                      {rec.incidentCount !== null
                        ? `${rec.incidentCount.toLocaleString()} FIRs`
                        : 'INSUFFICIENT DATA'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8A909E]">
                    <span>{rec.crimeCategory}</span>
                    <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#111316] border border-[#22262E]">
                      {GRANULARITY_LABELS[rec.geographicGranularity]}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 truncate">
                    Coverage: {rec.sectorOrLocality} ({rec.district})
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Record Provenance Box */}
          {selectedRecord && (
            <div className="p-3 rounded-lg bg-[#181A1F] border border-[#2A2F3A] space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#00D2FF]">
                  PROVENANCE & GRANULARITY AUDIT
                </span>
                <span className="font-mono text-[10px] text-emerald-400 uppercase">
                  {selectedRecord.verificationStatus}
                </span>
              </div>
              <div className="font-semibold text-white">
                {selectedRecord.policeStation} — {selectedRecord.crimeCategory} (
                {selectedRecord.year})
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{selectedRecord.notes}</p>
              <div className="pt-1.5 border-t border-[#22262E] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#8A909E]">
                <span>Source: {selectedRecord.source}</span>
                <span>Granularity: {selectedRecord.geographicGranularity.toUpperCase()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historical Multi-Year Comparison Table */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#22262E]">
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Historical Multi-Year Jurisdiction Comparison
            </h3>
            <p className="text-[11px] text-[#8A909E]">
              Comparing recorded FIR counts across Police Station jurisdictions to distinguish
              multi-year reporting trends from isolated fluctuations.
            </p>
          </div>
          <span className="text-[10px] font-mono text-[#8A909E]">
            Historical recorded crime ≠ real-time street safety
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#22262E] text-[10px] font-mono uppercase text-[#8A909E]">
                <th className="py-2 pr-3">Police Station</th>
                <th className="py-2 px-3">Jurisdiction Sectors</th>
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3 text-right">2022</th>
                <th className="py-2 px-3 text-right">2023</th>
                <th className="py-2 pl-3 text-right">YoY Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#181A1F]">
              {yoyComparisonRows.map((row) => (
                <tr
                  key={`${row.policeStation}-${row.category}`}
                  className="hover:bg-[#181A1F]/60 transition-colors"
                >
                  <td className="py-2.5 pr-3 font-medium text-white">{row.policeStation}</td>
                  <td className="py-2.5 px-3 text-[#8A909E]">{row.sectorOrLocality}</td>
                  <td className="py-2.5 px-3 text-slate-300">{row.category}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                    {row.y2022 !== null ? row.y2022 : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-white">
                    {row.y2023 !== null ? row.y2023 : '—'}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                    {row.deltaPct === null ? (
                      <span className="text-[#8A909E]">—</span>
                    ) : row.deltaPct < 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <TrendingDown className="w-3 h-3" />
                        {row.deltaPct}%
                      </span>
                    ) : row.deltaPct > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-400">
                        <TrendingUp className="w-3 h-3" />+{row.deltaPct}%
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
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
  );
};
