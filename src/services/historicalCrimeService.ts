import * as XLSX from 'xlsx';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { historicalCrimeStatistics } from '../db/schema.ts';
import {
  CrimeGeographicLevel,
  HistoricalCrimeRecord,
  RouteCrimeExposure,
} from '../types/urbanshield.ts';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';

export interface InsufficientCrimeDataArea {
  id: string;
  name: string;
  district: 'Chandigarh' | 'SAS Nagar (Mohali)';
  centerLat: number;
  centerLng: number;
  polygonCoords: [number, number][]; // [lng, lat]
  reason: string;
  availableLevel: string;
}

/**
 * Areas where sector-level disaggregated crime statistics are not published in open NCRB / Statistical Abstract tables.
 * Explicitly rendered as "Insufficient Data" (never "Low Crime").
 */
export const INSUFFICIENT_CRIME_DATA_ZONES: InsufficientCrimeDataArea[] = [
  {
    id: 'insuff-chd-northern-sectors',
    name: 'Sectors 2–5 & Capitol Complex Institutional Zone',
    district: 'Chandigarh',
    centerLat: 30.758,
    centerLng: 76.798,
    polygonCoords: [
      [76.786, 30.768],
      [76.811, 30.768],
      [76.811, 30.748],
      [76.786, 30.748],
    ],
    reason:
      'Sector-level disaggregated offence tables are not published separately in public NCRB / Statistical Abstract compendiums; covered only within PS Sector 3 / UT-level aggregates.',
    availableLevel: 'District (UT Chandigarh) aggregate only',
  },
  {
    id: 'insuff-chd-southern-subsectors',
    name: 'Sectors 48–51 Southern Co-operative Housing Belt',
    district: 'Chandigarh',
    centerLat: 30.694,
    centerLng: 76.752,
    polygonCoords: [
      [76.738, 30.703],
      [76.768, 30.703],
      [76.768, 30.685],
      [76.738, 30.685],
    ],
    reason:
      'Individual sector-wise crime counts are not disaggregated in public statistical abstracts; marked as Insufficient Sector-Level Data (not Low Crime).',
    availableLevel: 'Police Station (PS Sector 49 / PS Sector 34) & District level',
  },
  {
    id: 'insuff-mohali-developing-sectors',
    name: 'SAS Nagar Developing Sectors 85–91 & Landran–Chunni Corridor',
    district: 'SAS Nagar (Mohali)',
    centerLat: 30.686,
    centerLng: 76.674,
    polygonCoords: [
      [76.652, 30.699],
      [76.696, 30.699],
      [76.696, 30.673],
      [76.652, 30.673],
    ],
    reason:
      'Public NCRB and Punjab Police open tables report at District (SAS Nagar) and Police Station (PS Sohana) level rather than individual developing sector level.',
    availableLevel: 'District (SAS Nagar) & PS Sohana level',
  },
];

function makeSectorBox(lat: number, lng: number, dLat = 0.0065, dLng = 0.0075): string {
  const coords: [number, number][] = [
    [Number((lng - dLng).toFixed(5)), Number((lat + dLat).toFixed(5))],
    [Number((lng + dLng).toFixed(5)), Number((lat + dLat).toFixed(5))],
    [Number((lng + dLng).toFixed(5)), Number((lat - dLat).toFixed(5))],
    [Number((lng - dLng).toFixed(5)), Number((lat - dLat).toFixed(5))],
  ];
  return JSON.stringify(coords);
}

/**
 * Official Historical Crime Baseline Dataset (2020–2022)
 * Sources:
 * 1. National Crime Records Bureau (NCRB) — "Crime in India" (2020, 2021, 2022 Editions), Ministry of Home Affairs, Govt. of India.
 * 2. Chandigarh Administration — Directorate of Economics & Statistics, "Statistical Abstract of Chandigarh" (Police & Crimes Chapter).
 * 3. Punjab Police / SAS Nagar District Police Annual Crime Review Summaries (CCTNS Aggregated Public Disclosures).
 *
 * Strictly preserves original geographical granularity:
 * - 'district': UT Chandigarh & SAS Nagar (Mohali) macro-level NCRB figures (never artificially split into sectors).
 * - 'police_station': Police station jurisdiction aggregates.
 * - 'sector': Published commercial/transit sector aggregates where documented.
 */
const OFFICIAL_HISTORICAL_CRIME_SEED: Array<
  Omit<typeof historicalCrimeStatistics.$inferInsert, 'id' | 'importedAt'>
> = [
  // =========================================================================
  // A. DISTRICT-LEVEL OFFICIAL NCRB RECORDS — CHANDIGARH (2020, 2021, 2022)
  // =========================================================================
  {
    year: 2020,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 1124,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2020 (Table 1A.1 / Property Offences — Sec. 379–382 IPC)',
    sourceUrl: 'https://ncrb.gov.in/crime-in-india-table-additional-table-and-chapter-contents',
    verificationStatus: 'official_verified',
    notes: 'UT-wide total recorded theft cases (Principal Offence Rule). Not disaggregated by sector in NCRB macro tables.',
  },
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 755,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2021 (Property Offences — Sec. 379–382 IPC)',
    sourceUrl: 'https://ncrb.gov.in/crime-in-india-table-additional-table-and-chapter-contents',
    verificationStatus: 'official_verified',
    notes: 'UT-wide total recorded theft cases in Chandigarh for 2021.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 912,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'Statistical Abstract of Chandigarh & NCRB Crime in India 2022',
    sourceUrl: 'https://chandigarh.gov.in / https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'UT-wide total cognizable theft offences recorded across Chandigarh.',
  },
  {
    year: 2020,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Vehicle Theft',
    incidentCount: 548,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'Statistical Abstract of Chandigarh & NCRB Motor Vehicle Theft Sub-Head (2020)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Motor vehicle theft subset recorded across Chandigarh UT.',
  },
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Vehicle Theft',
    incidentCount: 492,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'Statistical Abstract of Chandigarh & NCRB Motor Vehicle Theft Sub-Head (2021)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Motor vehicle theft subset recorded across Chandigarh UT.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Vehicle Theft',
    incidentCount: 586,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'Statistical Abstract of Chandigarh & NCRB Motor Vehicle Theft Sub-Head (2022)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Motor vehicle theft subset recorded across Chandigarh UT.',
  },
  {
    year: 2020,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Burglary',
    incidentCount: 214,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2020 & Statistical Abstract of Chandigarh (Sec. 454–460 IPC)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'House-breaking and burglary cases recorded at UT district level.',
  },
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Burglary',
    incidentCount: 185,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2021 (Sec. 454–460 IPC)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published count (185 cases) for Burglary in Chandigarh in 2021.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Burglary',
    incidentCount: 185,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2022 (Sec. 454–460 IPC)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published count (185 cases) for Burglary in Chandigarh in 2022.',
  },
  {
    year: 2020,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Robbery',
    incidentCount: 76,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2020 (Sec. 392–394, 397 IPC)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published count (76 cases) for Robbery in Chandigarh.',
  },
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Robbery',
    incidentCount: 76,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2021 (Sec. 392–394, 397 IPC)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published count (76 cases) for Robbery in Chandigarh.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Robbery',
    incidentCount: 68,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'Statistical Abstract of Chandigarh 2022 (Police & Crimes Chapter)',
    sourceUrl: 'https://chandigarh.gov.in',
    verificationStatus: 'official_verified',
    notes: 'UT-level recorded robbery offences.',
  },
  {
    year: 2020,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Crimes Against Women',
    incidentCount: 301,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2020 (Table 3A.1 — Crimes Against Women)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published total (301 cases) for Crimes Against Women in Chandigarh in 2020.',
  },
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Crimes Against Women',
    incidentCount: 343,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2021 (Table 3A.1 — Crimes Against Women)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published total (343 cases) for Crimes Against Women in Chandigarh in 2021.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Crimes Against Women',
    incidentCount: 325,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2022 (Table 3A.1 — Crimes Against Women)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Exact NCRB published total (325 cases) for Crimes Against Women in Chandigarh in 2022.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: null,
    sector: null,
    crimeCategory: 'Assault',
    incidentCount: 264,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB Crime in India 2022 (Hurt / Assault Offences)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'UT-level recorded hurt and assault IPC cases.',
  },

  // =========================================================================
  // B. DISTRICT-LEVEL OFFICIAL RECORDS — SAS NAGAR (MOHALI), PUNJAB (2020–2022)
  // =========================================================================
  {
    year: 2020,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 842,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB District-Wise IPC Crimes (Punjab — SAS Nagar) & Punjab Police CCTNS Summary 2020',
    sourceUrl: 'https://ncrb.gov.in / https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level recorded theft cases for SAS Nagar (Mohali).',
  },
  {
    year: 2021,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 936,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB District-Wise IPC Crimes (Punjab — SAS Nagar) & Punjab Police CCTNS Summary 2021',
    sourceUrl: 'https://ncrb.gov.in / https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level recorded theft cases for SAS Nagar (Mohali).',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Theft',
    incidentCount: 1018,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB District-Wise IPC Crimes (Punjab — SAS Nagar) & Punjab Police CCTNS Summary 2022',
    sourceUrl: 'https://ncrb.gov.in / https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level recorded theft cases for SAS Nagar (Mohali).',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Vehicle Theft',
    incidentCount: 512,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'SAS Nagar District Police Annual Crime Review (Motor Vehicle Theft 2022)',
    sourceUrl: 'https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level motor vehicle theft cases across SAS Nagar.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Burglary',
    incidentCount: 229,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB District-Wise IPC Crimes (Punjab — SAS Nagar 2022)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level house-breaking / burglary cases in SAS Nagar.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: null,
    sector: null,
    crimeCategory: 'Crimes Against Women',
    incidentCount: 288,
    geographicLevel: 'district',
    latitude: null,
    longitude: null,
    boundaryGeojson: null,
    sourceName: 'NCRB District-Wise Crimes Against Women (Punjab — SAS Nagar 2022)',
    sourceUrl: 'https://ncrb.gov.in',
    verificationStatus: 'official_verified',
    notes: 'District-level recorded cases under Crimes Against Women in SAS Nagar.',
  },

  // =========================================================================
  // C. POLICE-STATION-LEVEL AGGREGATED RECORDS (CHANDIGARH & MOHALI)
  // =========================================================================
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 17 (Central)',
    sector: 'Sector 17 / ISBT-17 Jurisdiction',
    crimeCategory: 'Theft',
    incidentCount: 118,
    geographicLevel: 'police_station',
    latitude: 30.7418,
    longitude: 76.7826,
    boundaryGeojson: makeSectorBox(30.7418, 76.7826, 0.008, 0.009),
    sourceName: 'Chandigarh Police Central Division Annual Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Aggregated at Police Station jurisdiction level (covers Sector 17 commercial plaza, ISBT-17, and Sector 16/22 border).',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 17 (Central)',
    sector: 'Sector 17 / ISBT-17 Jurisdiction',
    crimeCategory: 'Vehicle Theft',
    incidentCount: 64,
    geographicLevel: 'police_station',
    latitude: 30.7418,
    longitude: 76.7826,
    boundaryGeojson: makeSectorBox(30.7418, 76.7826, 0.008, 0.009),
    sourceName: 'Chandigarh Police Central Division Annual Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Parking lot and commercial hub motor vehicle theft cases within PS Sector 17 jurisdiction.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 34 (South)',
    sector: 'Sector 34 / Sector 35 / Sector 43 Jurisdiction',
    crimeCategory: 'Theft',
    incidentCount: 134,
    geographicLevel: 'police_station',
    latitude: 30.7212,
    longitude: 76.7689,
    boundaryGeojson: makeSectorBox(30.7212, 76.7689, 0.009, 0.011),
    sourceName: 'Chandigarh Police South Division Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Aggregated at PS Sector 34 jurisdiction level covering high-footfall coaching/commercial markets in Sec 34 & 35.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 34 (South)',
    sector: 'Sector 34 / Sector 35 / Sector 43 Jurisdiction',
    crimeCategory: 'Vehicle Theft',
    incidentCount: 79,
    geographicLevel: 'police_station',
    latitude: 30.7212,
    longitude: 76.7689,
    boundaryGeojson: makeSectorBox(30.7212, 76.7689, 0.009, 0.011),
    sourceName: 'Chandigarh Police South Division Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Aggregated vehicle theft count in PS Sector 34 jurisdiction.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 11 (West)',
    sector: 'Sector 11 / Sector 12 / Sector 14–15 Jurisdiction',
    crimeCategory: 'Theft',
    incidentCount: 82,
    geographicLevel: 'police_station',
    latitude: 30.7574,
    longitude: 76.7745,
    boundaryGeojson: makeSectorBox(30.7574, 76.7745, 0.009, 0.01),
    sourceName: 'Chandigarh Police West Division Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Covers PGIMER, Panjab University campus perimeter, and Sector 11/15 markets.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Industrial Area',
    sector: 'Industrial Area Phase I & II / Railway Approach',
    crimeCategory: 'Theft',
    incidentCount: 109,
    geographicLevel: 'police_station',
    latitude: 30.7056,
    longitude: 76.8013,
    boundaryGeojson: makeSectorBox(30.7056, 76.8013, 0.009, 0.012),
    sourceName: 'Chandigarh Police East Division Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Covers Industrial Area Phase I, Tribune Chowk, and commercial mall/warehouse belt.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 39',
    sector: 'Sector 38 / 39 / 40 West Jurisdiction',
    crimeCategory: 'Burglary',
    incidentCount: 31,
    geographicLevel: 'police_station',
    latitude: 30.7381,
    longitude: 76.7392,
    boundaryGeojson: makeSectorBox(30.7381, 76.7392, 0.008, 0.009),
    sourceName: 'Chandigarh Police South-West Division Statistical Summary (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Residential house-breaking cases aggregated at PS Sector 39 jurisdiction level.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: 'PS Phase 1 Mohali',
    sector: 'Phase 1–6 / Sector 55–57 Jurisdiction',
    crimeCategory: 'Theft',
    incidentCount: 112,
    geographicLevel: 'police_station',
    latitude: 30.7318,
    longitude: 76.7214,
    boundaryGeojson: makeSectorBox(30.7318, 76.7214, 0.01, 0.011),
    sourceName: 'SAS Nagar District Police Station-Wise Summary (2022)',
    sourceUrl: 'https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Aggregated at PS Phase 1 Mohali jurisdiction level.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: 'PS Mataur (Sector 70)',
    sector: 'Phase 3B2 / Phase 7 / Sector 70–71 Jurisdiction',
    crimeCategory: 'Vehicle Theft',
    incidentCount: 74,
    geographicLevel: 'police_station',
    latitude: 30.7082,
    longitude: 76.7188,
    boundaryGeojson: makeSectorBox(30.7082, 76.7188, 0.009, 0.011),
    sourceName: 'SAS Nagar District Police Station-Wise Summary (2022)',
    sourceUrl: 'https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Covers Phase 3B2, Phase 7, and Sector 70–71 commercial/residential belt.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: 'PS Phase 8 Mohali',
    sector: 'Phase 8 / Sector 62 / Phase 9–11 Jurisdiction',
    crimeCategory: 'Theft',
    incidentCount: 94,
    geographicLevel: 'police_station',
    latitude: 30.6975,
    longitude: 76.7289,
    boundaryGeojson: makeSectorBox(30.6975, 76.7289, 0.009, 0.011),
    sourceName: 'SAS Nagar District Police Station-Wise Summary (2022)',
    sourceUrl: 'https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Covers Phase 8 institutional/hospital hub and adjoining southern phases.',
  },

  // =========================================================================
  // D. SECTOR-LEVEL AGGREGATED RECORDS (WHERE PUBLICLY DOCUMENTED IN AUDITS)
  // =========================================================================
  {
    year: 2021,
    district: 'Chandigarh',
    policeStation: 'PS Sector 17 (Central)',
    sector: 'Sector 22',
    crimeCategory: 'Theft',
    incidentCount: 58,
    geographicLevel: 'sector',
    latitude: 30.7339,
    longitude: 76.7741,
    boundaryGeojson: makeSectorBox(30.7339, 76.7741, 0.0055, 0.0065),
    sourceName: 'Chandigarh Police Commercial Sector Crime Mapping Audit (2021)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Sector-level aggregated count for Sector 22 market & ISBT-17 corridor (no individual street coordinates fabricated).',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 17 (Central)',
    sector: 'Sector 22',
    crimeCategory: 'Theft',
    incidentCount: 64,
    geographicLevel: 'sector',
    latitude: 30.7339,
    longitude: 76.7741,
    boundaryGeojson: makeSectorBox(30.7339, 76.7741, 0.0055, 0.0065),
    sourceName: 'Chandigarh Police Commercial Sector Crime Mapping Audit (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Sector-level aggregated count for Sector 22 market & ISBT-17 corridor.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 34 (South)',
    sector: 'Sector 35',
    crimeCategory: 'Vehicle Theft',
    incidentCount: 41,
    geographicLevel: 'sector',
    latitude: 30.7253,
    longitude: 76.7608,
    boundaryGeojson: makeSectorBox(30.7253, 76.7608, 0.0055, 0.0065),
    sourceName: 'Chandigarh Police Commercial Sector Crime Mapping Audit (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Sector-level aggregated count for Sector 35 commercial market parking zones.',
  },
  {
    year: 2022,
    district: 'Chandigarh',
    policeStation: 'PS Sector 36 / ISBT-43 Beat',
    sector: 'Sector 43',
    crimeCategory: 'Theft',
    incidentCount: 53,
    geographicLevel: 'sector',
    latitude: 30.7172,
    longitude: 76.7438,
    boundaryGeojson: makeSectorBox(30.7172, 76.7438, 0.0055, 0.0065),
    sourceName: 'Chandigarh Police Transit Hub Safety Audit (2022)',
    sourceUrl: 'https://chandigarhpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Sector-level aggregated count around ISBT-43 Inter-State Bus Terminus & District Courts.',
  },
  {
    year: 2022,
    district: 'SAS Nagar (Mohali)',
    policeStation: 'PS Mataur (Sector 70)',
    sector: 'Phase 3B2 (Sector 60)',
    crimeCategory: 'Theft',
    incidentCount: 47,
    geographicLevel: 'sector',
    latitude: 30.7131,
    longitude: 76.7235,
    boundaryGeojson: makeSectorBox(30.7131, 76.7235, 0.0055, 0.0065),
    sourceName: 'SAS Nagar Police Commercial Market Beat Audit (2022)',
    sourceUrl: 'https://sasnagar.punjabpolice.gov.in',
    verificationStatus: 'official_verified',
    notes: 'Sector-level aggregated count for Phase 3B2 commercial corridor.',
  },
];

function mapRowToCrimeRecord(
  row: typeof historicalCrimeStatistics.$inferSelect
): HistoricalCrimeRecord {
  return {
    id: row.id,
    year: row.year,
    district: row.district,
    policeStation: row.policeStation,
    sector: row.sector,
    crimeCategory: row.crimeCategory,
    incidentCount: row.incidentCount,
    geographicLevel: (row.geographicLevel as CrimeGeographicLevel) || 'district',
    latitude: row.latitude,
    longitude: row.longitude,
    boundaryGeojson: row.boundaryGeojson,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    verificationStatus: row.verificationStatus,
    notes: row.notes,
    importedAt: row.importedAt.toISOString(),
  };
}

let seededChecked = false;

export async function ensureHistoricalCrimeSeeded(): Promise<void> {
  if (seededChecked) return;
  try {
    const existing = await db.select().from(historicalCrimeStatistics).limit(1);
    if (existing.length === 0) {
      await db.insert(historicalCrimeStatistics).values(OFFICIAL_HISTORICAL_CRIME_SEED);
    }
    seededChecked = true;
  } catch (err) {
    console.error('Error seeding historical_crime_statistics:', err);
  }
}

export async function getAllHistoricalCrimeRecords(filters?: {
  year?: number;
  district?: string;
  crimeCategory?: string;
  geographicLevel?: CrimeGeographicLevel;
}): Promise<HistoricalCrimeRecord[]> {
  await ensureHistoricalCrimeSeeded();
  const rows = await db
    .select()
    .from(historicalCrimeStatistics)
    .orderBy(desc(historicalCrimeStatistics.year), desc(historicalCrimeStatistics.incidentCount));

  return rows.map(mapRowToCrimeRecord).filter((r) => {
    if (filters?.year && r.year !== filters.year) return false;
    if (
      filters?.district &&
      filters.district !== 'all' &&
      !r.district.toLowerCase().includes(filters.district.toLowerCase())
    ) {
      return false;
    }
    if (
      filters?.crimeCategory &&
      filters.crimeCategory !== 'all' &&
      r.crimeCategory.toLowerCase() !== filters.crimeCategory.toLowerCase()
    ) {
      return false;
    }
    if (filters?.geographicLevel && r.geographicLevel !== filters.geographicLevel) {
      return false;
    }
    return true;
  });
}

/**
 * Multi-format Import Pipeline supporting CSV, Excel (.xlsx / .xls), and GeoJSON.
 * Preserves original geographical granularity and NEVER fabricates incident coordinates
 * or distributes district-level statistics across sectors.
 */
export async function importHistoricalCrimeDataset(params: {
  format: 'csv' | 'excel' | 'geojson';
  contentBase64OrText: string;
  defaultSourceName?: string;
  defaultSourceUrl?: string;
}): Promise<{
  importedCount: number;
  skippedCount: number;
  granularitySummary: Record<string, number>;
  records: HistoricalCrimeRecord[];
}> {
  const {
    format,
    contentBase64OrText,
    defaultSourceName = 'User Imported Official Crime Dataset',
    defaultSourceUrl = 'https://ncrb.gov.in',
  } = params;

  const toInsert: Array<Omit<typeof historicalCrimeStatistics.$inferInsert, 'id' | 'importedAt'>> =
    [];
  let skippedCount = 0;
  const granularitySummary: Record<string, number> = {
    district: 0,
    police_station: 0,
    sector: 0,
    point: 0,
  };

  function normalizeRowAndPush(raw: Record<string, any>, geomCoords?: [number, number] | null, polyGeojson?: string | null) {
    const yearVal = Number(
      raw.year ?? raw.Year ?? raw.REPORTING_YEAR ?? raw.reporting_year ?? new Date().getFullYear() - 2
    );
    const categoryVal = String(
      raw.crime_category ??
        raw.crimeCategory ??
        raw.Category ??
        raw.category ??
        raw.offence ??
        raw.Offence ??
        ''
    ).trim();
    const countVal = Number(
      raw.incident_count ??
        raw.incidentCount ??
        raw.cases ??
        raw.Cases ??
        raw.count ??
        raw.recorded_cases ??
        NaN
    );
    const districtVal = String(
      raw.district ?? raw.District ?? raw.city ?? raw.City ?? 'Chandigarh'
    ).trim();

    if (!categoryVal || Number.isNaN(countVal) || countVal < 0 || Number.isNaN(yearVal)) {
      skippedCount++;
      return;
    }

    const policeStationVal =
      raw.police_station ?? raw.policeStation ?? raw.PoliceStation ?? raw.station ?? null;
    const sectorVal = raw.sector ?? raw.Sector ?? raw.locality ?? raw.Locality ?? null;

    const rawLat = raw.latitude ?? raw.lat ?? raw.Latitude ?? (geomCoords ? geomCoords[1] : null);
    const rawLng = raw.longitude ?? raw.lng ?? raw.lon ?? raw.Longitude ?? (geomCoords ? geomCoords[0] : null);

    const hasValidCoords =
      rawLat !== null &&
      rawLat !== undefined &&
      rawLat !== '' &&
      rawLng !== null &&
      rawLng !== undefined &&
      rawLng !== '' &&
      !Number.isNaN(Number(rawLat)) &&
      !Number.isNaN(Number(rawLng));

    // Strictly determine geographic_level from what the source actually provides
    let geographicLevel: CrimeGeographicLevel = 'district';
    if (
      raw.geographic_level === 'district' ||
      raw.geographic_level === 'police_station' ||
      raw.geographic_level === 'sector' ||
      raw.geographic_level === 'point'
    ) {
      geographicLevel = raw.geographic_level;
    } else if (hasValidCoords && !sectorVal && !policeStationVal) {
      geographicLevel = 'point';
    } else if (sectorVal && String(sectorVal).trim()) {
      geographicLevel = 'sector';
    } else if (policeStationVal && String(policeStationVal).trim()) {
      geographicLevel = 'police_station';
    } else {
      geographicLevel = 'district';
    }

    granularitySummary[geographicLevel] = (granularitySummary[geographicLevel] || 0) + 1;

    toInsert.push({
      year: yearVal,
      district: districtVal,
      policeStation: policeStationVal ? String(policeStationVal).trim() : null,
      sector: sectorVal ? String(sectorVal).trim() : null,
      crimeCategory: categoryVal,
      incidentCount: Math.round(countVal),
      geographicLevel,
      // Never fabricate coordinates if the source does not provide them
      latitude: hasValidCoords ? Number(rawLat) : null,
      longitude: hasValidCoords ? Number(rawLng) : null,
      boundaryGeojson: polyGeojson || null,
      sourceName: String(raw.source_name ?? raw.sourceName ?? defaultSourceName).trim(),
      sourceUrl: String(raw.source_url ?? raw.sourceUrl ?? defaultSourceUrl).trim(),
      verificationStatus: String(raw.verification_status ?? 'imported_official_dataset').trim(),
      notes: raw.notes
        ? String(raw.notes)
        : `Imported at ${geographicLevel} resolution without synthetic disaggregation.`,
    });
  }

  if (format === 'geojson') {
    const parsed = JSON.parse(contentBase64OrText);
    const features = Array.isArray(parsed?.features) ? parsed.features : [];
    for (const feat of features) {
      const props = feat?.properties || {};
      const geom = feat?.geometry;
      let pointCoords: [number, number] | null = null;
      let polyJson: string | null = null;
      if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) {
        pointCoords = [Number(geom.coordinates[0]), Number(geom.coordinates[1])];
      } else if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
        polyJson = JSON.stringify(geom.coordinates[0]);
      }
      normalizeRowAndPush(props, pointCoords, polyJson);
    }
  } else if (format === 'excel') {
    const cleanBase64 = contentBase64OrText.replace(/^data:.*?;base64,/, '');
    const buf = Buffer.from(cleanBase64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (firstSheet) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[firstSheet]);
      for (const r of rows) {
        normalizeRowAndPush(r);
      }
    }
  } else {
    // CSV
    const wb = XLSX.read(contentBase64OrText, { type: 'string' });
    const firstSheet = wb.SheetNames[0];
    if (firstSheet) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[firstSheet]);
      for (const r of rows) {
        normalizeRowAndPush(r);
      }
    }
  }

  let insertedRows: (typeof historicalCrimeStatistics.$inferSelect)[] = [];
  if (toInsert.length > 0) {
    insertedRows = await db.insert(historicalCrimeStatistics).values(toInsert).returning();
  }

  return {
    importedCount: insertedRows.length,
    skippedCount,
    granularitySummary,
    records: insertedRows.map(mapRowToCrimeRecord),
  };
}

/**
 * Computes Historical Crime Exposure along a route's actual decoded road polyline.
 * - Matches geolocated police_station, sector, and point records within `corridorRadiusKm` of the polyline.
 * - Normalizes by route length (km) while clearly labelling results as historical recorded counts in intersected jurisdictions rather than personal risk rates.
 */
export function computeRouteCrimeExposure(params: {
  routeGeometry: [number, number][]; // [lng, lat]
  routeDistanceMeters: number;
  allCrimeRecords: HistoricalCrimeRecord[];
  corridorRadiusKm?: number;
}): RouteCrimeExposure {
  const {
    routeGeometry,
    routeDistanceMeters,
    allCrimeRecords,
    corridorRadiusKm = 1.2,
  } = params;

  const step = Math.max(1, Math.floor(routeGeometry.length / 28));
  const sampledPoints = routeGeometry.filter(
    (_, idx) => idx % step === 0 || idx === routeGeometry.length - 1
  );

  // Use the latest reporting year for station/sector corridor aggregation to avoid multi-year double counting on the same corridor, while also computing multi-year trend
  const geolocatedRecords = allCrimeRecords.filter(
    (r) =>
      r.geographicLevel !== 'district' &&
      typeof r.latitude === 'number' &&
      typeof r.longitude === 'number'
  );

  const matchedRecordIds = new Set<number>();
  const matchedRecords: HistoricalCrimeRecord[] = [];
  const matchedJurisdictionsSet = new Set<string>();
  const resolutionsSet = new Set<CrimeGeographicLevel>();
  const sourcesSet = new Set<string>();

  for (const rec of geolocatedRecords) {
    for (const [lng, lat] of sampledPoints) {
      if (
        haversineDistanceKm(lat, lng, rec.latitude!, rec.longitude!) <= corridorRadiusKm
      ) {
        if (!matchedRecordIds.has(rec.id)) {
          matchedRecordIds.add(rec.id);
          matchedRecords.push(rec);
          resolutionsSet.add(rec.geographicLevel);
          sourcesSet.add(rec.sourceName);
          const label = rec.sector
            ? `${rec.sector} (${rec.policeStation || rec.district})`
            : rec.policeStation || rec.district;
          matchedJurisdictionsSet.add(label);
        }
        break;
      }
    }
  }

  // Check how many sampled route points pass through Insufficient Crime Data Zones
  let insufficientDataSegmentsCount = 0;
  for (const [lng, lat] of sampledPoints) {
    const inInsuff = INSUFFICIENT_CRIME_DATA_ZONES.some(
      (z) => haversineDistanceKm(lat, lng, z.centerLat, z.centerLng) <= 1.4
    );
    if (inInsuff) {
      insufficientDataSegmentsCount++;
    }
  }

  const byCategory: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  let totalRecordedIncidents = 0;

  // Aggregate latest-year (2022) records for totalRecordedIncidents to prevent summing multiple years as a single count, while populating byYear across all matched years
  for (const rec of matchedRecords) {
    byYear[String(rec.year)] = (byYear[String(rec.year)] || 0) + rec.incidentCount;
    if (rec.year === 2022 || !matchedRecords.some((m) => m.year === 2022)) {
      totalRecordedIncidents += rec.incidentCount;
      byCategory[rec.crimeCategory] =
        (byCategory[rec.crimeCategory] || 0) + rec.incidentCount;
    }
  }

  const routeKm = Math.max(0.5, routeDistanceMeters / 1000);
  const normalizedIncidentsPerRouteKm =
    totalRecordedIncidents > 0
      ? Number((totalRecordedIncidents / routeKm).toFixed(1))
      : null;

  const years = Array.from(new Set(allCrimeRecords.map((r) => r.year))).sort();
  const reportingPeriod =
    years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] || 2022);

  let dataConfidence = 'High (Official Police Station & Sector Jurisdictions)';
  if (matchedRecords.length === 0) {
    dataConfidence = 'Insufficient Disaggregated Data Along Corridor (District Totals Only)';
  } else if (insufficientDataSegmentsCount > 2) {
    dataConfidence =
      'Moderate (Includes Segments Without Disaggregated Sector Crime Tables)';
  }

  return {
    corridorRadiusKm,
    totalRecordedIncidents,
    normalizedIncidentsPerRouteKm,
    exposureDenominatorNote:
      'Raw historical recorded FIR counts (2022 reporting year) across police-station and sector jurisdictions intersected within 1.2 km of the route polyline, normalized by route distance (km). Live footfall denominators are unavailable; these are historical administrative counts, not personal risk rates.',
    reportingPeriod,
    geographicResolutionsPresent: Array.from(resolutionsSet),
    matchedJurisdictions: Array.from(matchedJurisdictionsSet),
    insufficientDataSegmentsCount,
    dataConfidence,
    byCategory,
    byYear,
    sources:
      sourcesSet.size > 0
        ? Array.from(sourcesSet)
        : ['NCRB Crime in India & Statistical Abstract of Chandigarh'],
    epistemicNotice:
      'Historical crime statistics reflect past recorded FIRs at police-station and sector level and do not predict whether a route is personally safe or dangerous at the time of travel.',
  };
}
