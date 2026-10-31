import { GoogleGenAI, Type } from '@google/genai';
import {
  ActiveJourneyContext,
  CityPoi,
  CommunityReport,
  HistoricalCrimeRecord,
  ResolvedLocation,
  SmartRouteOption,
  TravelMode,
} from '../types/urbanshield.ts';
import {
  computeSmartRoutesWithGoogleMaps,
  resolveLocationDynamic,
} from './googleMapsService.ts';
import {
  DOCUMENTED_CCTV_COVERAGE_ZONES,
  DOCUMENTED_STREETLIGHT_CORRIDORS,
  haversineDistanceKm,
} from '../data/chandigarhMohaliBaseline.ts';
import {
  getAllHistoricalCrimeRecords,
  INSUFFICIENT_CRIME_DATA_ZONES,
} from './historicalCrimeService.ts';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedRouteIntent {
  isRouteOrFollowup: boolean;
  originText: string | null;
  destinationText: string | null;
  travelMode: TravelMode | null;
  timeOfTravel: string | null;
  preference: 'fastest' | 'higher_activity' | 'balanced' | null;
  nearbyFacilityFocus: string | null;
}

function parseIntentDeterministically(
  prompt: string,
  activeJourney?: ActiveJourneyContext | null
): ExtractedRouteIntent {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  let travelMode: TravelMode | null = null;
  if (/\b(walk|walking|on foot|pedestrian)\b/i.test(lower)) {
    travelMode = 'foot';
  } else if (/\b(bike|bicycle|cycle|cycling|two-wheeler)\b/i.test(lower)) {
    travelMode = 'bike';
  } else if (/\b(drive|driving|car|cab|taxi|auto)\b/i.test(lower)) {
    travelMode = 'car';
  }

  let timeOfTravel: string | null = null;
  const timeMatch = clean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))\b/);
  if (timeMatch) {
    timeOfTravel = timeMatch[1];
  } else if (/\b(night|late evening|after dark|midnight|late night)\b/i.test(lower)) {
    timeOfTravel = 'Night / Late Evening';
  } else if (/\b(morning|daytime|afternoon)\b/i.test(lower)) {
    timeOfTravel = 'Daytime';
  }

  let preference: 'fastest' | 'higher_activity' | 'balanced' | null = null;
  if (/\b(quickest|fastest|shortest time|urgent)\b/i.test(lower)) {
    preference = 'fastest';
  } else if (
    /\b(night|more nearby|active|well-lit|safer|higher activity|establishments|shops)\b/i.test(
      lower
    )
  ) {
    preference = 'higher_activity';
  } else if (/\b(balanced|balance)\b/i.test(lower)) {
    preference = 'balanced';
  }

  let nearbyFacilityFocus: string | null = null;
  if (/\b(hospital|hospitals|medical|clinic|emergency)\b/i.test(lower)) {
    nearbyFacilityFocus = 'hospital';
  } else if (/\b(police|station|security)\b/i.test(lower)) {
    nearbyFacilityFocus = 'police';
  } else if (/\b(pharmacy|pharmacies|chemist|medicine)\b/i.test(lower)) {
    nearbyFacilityFocus = 'pharmacy';
  } else if (/\b(petrol|fuel|gas)\b/i.test(lower)) {
    nearbyFacilityFocus = 'fuel';
  } else if (/\b(bus|transport|transit|railway)\b/i.test(lower)) {
    nearbyFacilityFocus = 'transport';
  }

  const stripped = clean
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM).*$/i, '')
    .replace(/\s+(?:at\s+night|in\s+the\s+evening|by\s+car|by\s+walk|on\s+foot).*$/i, '')
    .replace(/[?.!].*$/, '')
    .trim();

  let originText: string | null = null;
  let destinationText: string | null = null;

  const fromToMatch = stripped.match(
    /(?:from|between)\s+([A-Za-z0-9\s,.-]+?)\s+(?:to|and|towards)\s+([A-Za-z0-9\s,.-]+)$/i
  );
  if (fromToMatch) {
    originText = fromToMatch[1].trim();
    destinationText = fromToMatch[2].trim();
  } else {
    const directToMatch = stripped.match(
      /^(?:route\s+|compare\s+routes\s+|go\s+|travel\s+)?([A-Za-z0-9\s,.-]{3,45}?)\s+(?:to|->|→)\s+([A-Za-z0-9\s,.-]{3,45})$/i
    );
    if (
      directToMatch &&
      !/^(what|which|how|show|find|where|tell|can|is|are)\b/i.test(directToMatch[1].trim())
    ) {
      originText = directToMatch[1].trim();
      destinationText = directToMatch[2].trim();
    }
  }

  const hasActiveJourney = Boolean(activeJourney?.origin && activeJourney?.destination);
  const isFollowup =
    hasActiveJourney &&
    !originText &&
    !destinationText &&
    (travelMode !== null ||
      timeOfTravel !== null ||
      preference !== null ||
      nearbyFacilityFocus !== null ||
      /\b(this route|that route|route alternatives|my route|what about|what if|instead|along the route|nearby|compare|which one)\b/i.test(
        lower
      ));

  return {
    isRouteOrFollowup: Boolean((originText && destinationText) || isFollowup),
    originText,
    destinationText,
    travelMode,
    timeOfTravel,
    preference,
    nearbyFacilityFocus,
  };
}

async function extractRouteIntentWithGemini(
  apiKey: string | undefined,
  prompt: string,
  history: ConversationTurn[],
  activeJourney?: ActiveJourneyContext | null
): Promise<ExtractedRouteIntent> {
  const deterministic = parseIntentDeterministically(prompt, activeJourney);

  const lower = prompt.toLowerCase();
  const isStandaloneCrimeOrInfraQuery =
    !deterministic.originText &&
    !deterministic.destinationText &&
    /\b(historical crime|recorded crime|theft statistics|crime data|cctv|surveillance|streetlight|lighting coverage|which chandigarh sectors|over the available years)\b/i.test(
      lower
    ) &&
    !/\b(route alternatives|across my route)\b/i.test(lower);

  if (!apiKey || deterministic.isRouteOrFollowup || isStandaloneCrimeOrInfraQuery) {
    return deterministic;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const recentHistoryText = history
      .slice(-6)
      .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
      .join('\n');

    const activeContextText = activeJourney
      ? `Current Active Journey: Origin="${activeJourney.origin.name}" (${activeJourney.origin.address}), Destination="${activeJourney.destination.name}" (${activeJourney.destination.address}), Mode="${activeJourney.mode}", Time="${activeJourney.timeOfTravel || 'unspecified'}".`
      : 'No active journey yet.';

    const extractionPrompt = `Extract route planning parameters from the user's message in Chandigarh and Mohali, India.
${activeContextText}
Recent Conversation:
${recentHistoryText}

Current User Message: "${prompt}"

Rules:
- If the user mentions a new origin and destination (e.g., "Chandigarh Railway Station to CGC University Mohali", "Sector 17 to Phase 8", "Elante Mall to Sukhna Lake"), set originText and destinationText to those exact place names.
- If the user is asking a follow-up question about the existing journey (e.g., "What about at night?", "What if I walk?", "Show nearby hospitals", "Compare historical crime exposure across my route alternatives"), set isRouteOrFollowup=true and leave originText=null and destinationText=null so the system reuses the active journey endpoints.
- Map travel mode to "car", "foot", or "bike" if specified, otherwise null.
- Extract timeOfTravel if mentioned (e.g. "10 PM", "night", "daytime").`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const resp = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: extractionPrompt,
      config: {
        abortSignal: controller.signal,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isRouteOrFollowup: { type: Type.BOOLEAN },
            originText: { type: Type.STRING, nullable: true },
            destinationText: { type: Type.STRING, nullable: true },
            travelMode: { type: Type.STRING, nullable: true },
            timeOfTravel: { type: Type.STRING, nullable: true },
            preference: { type: Type.STRING, nullable: true },
            nearbyFacilityFocus: { type: Type.STRING, nullable: true },
          },
          required: ['isRouteOrFollowup'],
        },
      },
    });
    clearTimeout(timer);

    if (resp.text) {
      const parsed = JSON.parse(resp.text) as Partial<ExtractedRouteIntent>;
      const validMode: TravelMode | null =
        parsed.travelMode === 'foot' || parsed.travelMode === 'bike' || parsed.travelMode === 'car'
          ? parsed.travelMode
          : deterministic.travelMode;

      return {
        isRouteOrFollowup: Boolean(parsed.isRouteOrFollowup || deterministic.isRouteOrFollowup),
        originText: parsed.originText?.trim() || deterministic.originText,
        destinationText: parsed.destinationText?.trim() || deterministic.destinationText,
        travelMode: validMode,
        timeOfTravel: parsed.timeOfTravel || deterministic.timeOfTravel,
        preference:
          parsed.preference === 'fastest' ||
          parsed.preference === 'higher_activity' ||
          parsed.preference === 'balanced'
            ? parsed.preference
            : deterministic.preference,
        nearbyFacilityFocus: parsed.nearbyFacilityFocus || deterministic.nearbyFacilityFocus,
      };
    }
  } catch {
    // Use deterministic extraction on error or timeout
  }

  return deterministic;
}

function buildDeterministicRouteExplanation(
  journey: ActiveJourneyContext,
  recommended: SmartRouteOption,
  nearbyFocus: string | null
): string {
  const modeLabel =
    journey.mode === 'foot' ? 'Walking' : journey.mode === 'bike' ? 'Cycling' : 'Driving';
  const lines: string[] = [
    `### Route Intelligence: ${journey.origin.name} → ${journey.destination.name}`,
    `**Travel Mode:** ${modeLabel}${
      journey.timeOfTravel ? ` · **Time Context:** ${journey.timeOfTravel}` : ''
    }`,
    `**Resolved Origin:** ${journey.origin.address} (${journey.origin.latitude.toFixed(4)}° N, ${journey.origin.longitude.toFixed(4)}° E)`,
    `**Resolved Destination:** ${journey.destination.address} (${journey.destination.latitude.toFixed(4)}° N, ${journey.destination.longitude.toFixed(4)}° E)`,
    '',
    '#### Calculated Route Options:',
  ];

  for (const r of journey.routes) {
    const km = (r.distanceMeters / 1000).toFixed(1);
    const mins = Math.max(1, Math.round(r.durationSeconds / 60));
    const infra = r.nightActivity.infrastructureIntelligence;
    const crime = r.crimeExposure;
    lines.push(
      `- **${r.label}** (${km} km, ~${mins} min via *${r.summaryRoads}*): Night Activity Score **${r.nightActivity.overallScore}/100** (Confidence: ${r.nightActivity.confidencePercentage}%) — ${r.nearbyPoisCount.hospitals} hospitals, ${r.nearbyPoisCount.police} police stations, ${r.nearbyPoisCount.pharmacies} pharmacies, ${r.nearbyPoisCount.activeEstablishments} mapped establishments, longest help-point gap **${r.nightActivity.longestGapBetweenHelpPointsKm ?? 'N/A'} km**.` +
        (infra
          ? `\n  - *CCTV & Streetlight Basis:* ${infra.cctvExplanation} (${infra.verifiedCctvJunctions} verified multi-camera junctions / ~${infra.estimatedTotalJunctionCameras} cameras; zones: ${infra.documentedSurveillanceZonesMatched.join(', ') || 'None'}) · ${infra.streetlightExplanation} (${infra.documentedLightingCorridorsMatched.join(', ') || 'No documented municipal corridor matched'}).`
          : '') +
        (crime
          ? `\n  - *Historical Crime Exposure (${crime.reportingPeriod}, ${crime.corridorRadiusKm} km corridor):* **${crime.totalRecordedIncidents}** recorded cases (${crime.normalizedIncidentsPerRouteKm ?? 'N/A'} cases/km across ${crime.geographicResolutionsPresent.join(', ')} records; confidence: ${crime.dataConfidence}).`
          : '')
    );
  }

  lines.push('');
  lines.push(
    `#### Recommended Option: **${recommended.label}**`,
    `${recommended.comparisonVsFastestText || ''} For your journey${
      journey.timeOfTravel ? ` (${journey.timeOfTravel})` : ''
    }, **${recommended.label}** (${(recommended.distanceMeters / 1000).toFixed(1)} km, ~${Math.max(
      1,
      Math.round(recommended.durationSeconds / 60)
    )} min) via **${recommended.summaryRoads}** achieves a Night Activity Score of **${
      recommended.nightActivity.overallScore
    }/100** (${recommended.nightActivity.mainRoadCoveragePercentage ?? recommended.nightActivity.factors.mainRoadScore}% main-road coverage, ${
      recommended.nearbyPoisCount.hospitals + recommended.nearbyPoisCount.police
    } emergency facilities nearby).`
  );

  if (nearbyFocus && journey.nearbyAlongRoute && journey.nearbyAlongRoute.length > 0) {
    const filtered = journey.nearbyAlongRoute.filter((p) => p.category === nearbyFocus);
    if (filtered.length > 0) {
      lines.push('', `#### Verified ${nearbyFocus.toUpperCase()} Facilities Along Route:`);
      for (const f of filtered.slice(0, 6)) {
        lines.push(
          `- **${f.name}** (${f.address || 'Chandigarh/Mohali'}) — ${
            f.openingHours || 'Hours not documented'
          }${f.phone ? ` · Tel: ${f.phone}` : ''}`
        );
      }
    }
  }

  return lines.join('\n');
}

function buildDeterministicIntelligenceReply(
  prompt: string,
  crimeRecords: HistoricalCrimeRecord[],
  allPois: CityPoi[],
  refLat: number,
  refLng: number,
  activeJourney?: ActiveJourneyContext | null
): string {
  const lower = prompt.toLowerCase();

  // 1. Route crime comparison follow-up
  if (
    activeJourney &&
    activeJourney.routes.length > 0 &&
    /\b(crime|theft|robbery|burglary|assault|historical|exposure)\b/i.test(lower)
  ) {
    const lines: string[] = [
      `### Historical Crime Exposure Comparison: ${activeJourney.origin.name} → ${activeJourney.destination.name}`,
      `Grounded in official **NCRB Crime in India (2020–2022)**, **Chandigarh Administration Statistical Abstract**, and **Chandigarh / SAS Nagar Police** station & sector records:`,
      '',
    ];
    for (const r of activeJourney.routes) {
      const c = r.crimeExposure;
      if (!c) continue;
      const topCats = Object.entries(c.byCategory)
        .slice(0, 4)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(', ');
      lines.push(
        `- **${r.label}** (${(r.distanceMeters / 1000).toFixed(1)} km via *${r.summaryRoads}*):`,
        `  - **Recorded Incidents in Intersected Jurisdictions (${c.reportingPeriod}):** ${c.totalRecordedIncidents} total cases (${c.normalizedIncidentsPerRouteKm ?? 'N/A'} recorded cases per route km)`,
        `  - **Category Breakdown:** ${topCats || 'No disaggregated sector/station records intersected'}`,
        `  - **Geographic Resolution & Confidence:** \`${c.geographicResolutionsPresent.join(', ')}\` (${c.dataConfidence})`,
        `  - **Matched Jurisdictions:** ${c.matchedJurisdictions.join('; ') || 'None'}`,
        ...(c.insufficientDataSegmentsCount > 0
          ? [`  - **Insufficient Data Segments Along Corridor:** ${c.insufficientDataSegmentsCount} segment(s) pass through areas without sector-level disaggregation`]
          : [])
      );
    }
    lines.push(
      '',
      `*Epistemic Notice:* Historical crime statistics reflect officially recorded FIRs in administrative jurisdictions over 2020–2022, not real-time incident feeds or personal victimisation probabilities. Areas without granular station/sector disaggregation are explicitly marked as **Insufficient Data**, never "Low Crime".`
    );
    return lines.join('\n');
  }

  // 2. General Historical Crime Query
  if (
    /\b(crime|ncrb|theft|burglary|robbery|assault|women|hotspot|recorded cases|sectors have higher|changed over the available years)\b/i.test(
      lower
    )
  ) {
    const sectorRecords = crimeRecords.filter((r) => r.geographicLevel === 'sector');
    const stationRecords = crimeRecords.filter((r) => r.geographicLevel === 'police_station');
    const districtRecords = crimeRecords.filter((r) => r.geographicLevel === 'district');

    const sectorTotals = new Map<string, { total: number; categories: Record<string, number>; source: string }>();
    for (const r of sectorRecords) {
      const key = `${r.sector} (${r.district})`;
      const cur = sectorTotals.get(key) || { total: 0, categories: {}, source: r.sourceName };
      cur.total += r.incidentCount;
      cur.categories[r.crimeCategory] = (cur.categories[r.crimeCategory] || 0) + r.incidentCount;
      sectorTotals.set(key, cur);
    }

    const yearTotals = new Map<number, number>();
    for (const r of districtRecords) {
      yearTotals.set(r.year, (yearTotals.get(r.year) || 0) + r.incidentCount);
    }

    const isTheftFocus = /\b(theft|vehicle theft)\b/i.test(lower);
    const theftRecords = crimeRecords.filter(
      (r) => r.crimeCategory === 'Theft' || r.crimeCategory === 'Vehicle Theft'
    );

    const lines: string[] = [
      `### Historical Crime Hotspot Intelligence (Chandigarh & SAS Nagar Mohali, 2020–2022)`,
      `**Official Data Sources:** National Crime Records Bureau (*Crime in India* 2020, 2021, 2022), Directorate of Economics & Statistics (*Chandigarh Administration Statistical Abstract*), and *Chandigarh Police / SAS Nagar Police* station-level crime digests.`,
      '',
    ];

    if (isTheftFocus) {
      lines.push(`#### Historical Theft & Vehicle Theft Statistics:`);
      for (const r of theftRecords.slice(0, 12)) {
        lines.push(
          `- **${r.year} · ${r.district}${r.policeStation ? ` (${r.policeStation})` : ''}${r.sector ? ` — ${r.sector}` : ''}** [Granularity: \`${r.geographicLevel}\`]: **${r.incidentCount}** recorded cases of *${r.crimeCategory}* (*Source: ${r.sourceName}*)`
        );
      }
      lines.push('');
    }

    lines.push(`#### 1. Multi-Year District Macro Trends (NCRB Official Totals):`);
    for (const yr of [2020, 2021, 2022]) {
      const yrRows = districtRecords.filter((r) => r.year === yr);
      if (yrRows.length > 0) {
        const breakdown = yrRows
          .map((r) => `${r.district} ${r.crimeCategory}: **${r.incidentCount}**`)
          .join(' · ');
        lines.push(`- **${yr}** (Combined macro categories: **${yearTotals.get(yr) || 0}** cases): ${breakdown}`);
      }
    }

    lines.push('', `#### 2. Sector-Level Commercial & Transit Hotspots (2022 Disaggregated Records):`);
    const sortedSectors = Array.from(sectorTotals.entries()).sort((a, b) => b[1].total - a[1].total);
    for (const [secName, info] of sortedSectors) {
      const catText = Object.entries(info.categories)
        .map(([c, n]) => `${c}: ${n}`)
        .join(', ');
      lines.push(`- **${secName}**: **${info.total}** recorded cases (${catText}) — *${info.source}*`);
    }

    lines.push('', `#### 3. Police Station Jurisdiction Totals (2021–2022):`);
    const stationSummary = new Map<string, number>();
    for (const r of stationRecords) {
      const k = `${r.policeStation} (${r.sector || r.district})`;
      stationSummary.set(k, (stationSummary.get(k) || 0) + r.incidentCount);
    }
    for (const [stName, count] of Array.from(stationSummary.entries()).slice(0, 8)) {
      lines.push(`- **${stName}**: **${count}** recorded cases across tracked categories`);
    }

    lines.push(
      '',
      `#### 4. Areas Marked as "Insufficient Data" (Never Assumed Low Crime):`,
      ...INSUFFICIENT_CRIME_DATA_ZONES.map(
        (z) => `- **${z.name}**: ${z.reason} (*Available Resolution: ${z.availableLevel}*)`
      )
    );

    return lines.join('\n');
  }

  // 3. CCTV & Streetlight Infrastructure Query
  if (/\b(cctv|camera|surveillance|iccc|streetlight|lighting|street lamp|dark|poles)\b/i.test(lower)) {
    const cctvPois = allPois.filter((p) => p.category === 'cctv');
    const totalJunctionCams = cctvPois.reduce((s, p) => s + (p.cameraCount || 1), 0);
    const lines: string[] = [
      `### UrbanShield CCTV & Streetlight Epistemic Intelligence (Chandigarh & Mohali)`,
      `OpenStreetMap only maps individual poles sporadically. **A missing OpenStreetMap node does NOT mean infrastructure is absent.** UrbanShield separates infrastructure into four distinct epistemic tiers:`,
      '',
      `#### 1. CCTV Surveillance Tiers:`,
      `- **Verified Multi-Camera CCTV Junctions & Individual Cameras:** **${cctvPois.length}** mapped locations representing **~${totalJunctionCams} physical cameras** (e.g., Aroma Chowk, Tribune Chowk, Housing Board Chowk, ISBT-43 Chowk, Sohana Gurdwara Chowk, and Phase 3B2/7 Mohali each carry **6 to 12 ANPR/RLVD/PTZ cameras** per junction).`,
      `- **Documented Surveillance Coverage Zones (${DOCUMENTED_CCTV_COVERAGE_ZONES.length} official zones):**`,
      ...DOCUMENTED_CCTV_COVERAGE_ZONES.map(
        (z) =>
          `  - **${z.name}** (*${z.authority}*): ${z.estimatedCameraCountRange || 'Multi-camera network'} across ${z.documentedJunctionsCount || 'multiple'} junctions (${z.cameraSystemDetails}) — *Source: ${z.sourceName}*`
      ),
      `- **Unknown CCTV Coverage Areas:** Internal residential lanes (V5/V6 roads) and peripheral expansion sectors where public camera registries are not published.`,
      '',
      `#### 2. Municipal Streetlight Tiers:`,
      `- **Documented Municipal Streetlight Corridors (${DOCUMENTED_STREETLIGHT_CORRIDORS.length} corridors):**`,
      ...DOCUMENTED_STREETLIGHT_CORRIDORS.map(
        (c) =>
          `  - **${c.name}** (*${c.roadName}*, *${c.authority}*): ${c.lightingSpec} — *Source: ${c.sourceName}*`
      ),
      `- **Night Activity Score Epistemic Rule:** Routes along documented municipal corridors (Madhya Marg, Dakshin Marg, Jan Marg, Udyog Path, Himalaya Marg, Vikas Marg, PR-7 Airport Road) receive documented corridor lighting scores (**84–94/100**) rather than being penalised for unmapped individual OSM lamp poles.`,
    ];
    return lines.join('\n');
  }

  // 4. Default Nearest Verified Facilities
  const nearestPois = allPois
    .map((p) => ({
      ...p,
      distKm: Number(haversineDistanceKm(refLat, refLng, p.latitude, p.longitude).toFixed(2)),
    }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 10);

  return `### Verified City Facilities Near (${refLat.toFixed(4)}° N, ${refLng.toFixed(4)}° E)\n${nearestPois
    .slice(0, 6)
    .map(
      (p) =>
        `- **${p.name}** (${p.category.toUpperCase()}, ${p.distKm} km) — ${
          p.address || 'Chandigarh/Mohali'
        }${p.phone ? ` · Tel: ${p.phone}` : ''}`
    )
    .join('\n')}`;
}

export async function handleDynamicAiAssistantQuery(params: {
  apiKey: string | undefined;
  prompt: string;
  userLocation: { lat: number; lng: number };
  conversationHistory: ConversationTurn[];
  activeJourney?: ActiveJourneyContext | null;
  selectedRouteSummary?: string;
  weights?: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
  allPois: CityPoi[];
  allReports: CommunityReport[];
}): Promise<{
  reply: string;
  journey: ActiveJourneyContext | null;
  groundedFacilitiesCount: number;
  groundedReportsCount: number;
  quotaExceeded: boolean;
}> {
  const {
    apiKey,
    prompt,
    userLocation,
    conversationHistory,
    activeJourney,
    selectedRouteSummary,
    weights,
    allPois,
    allReports,
  } = params;

  const [intent, crimeRecords] = await Promise.all([
    extractRouteIntentWithGemini(apiKey, prompt, conversationHistory, activeJourney),
    getAllHistoricalCrimeRecords(),
  ]);

  let quotaExceeded = false;
  let updatedJourney: ActiveJourneyContext | null = activeJourney || null;

  // Case 1: New Origin & Destination OR Follow-up on Active Journey
  if (intent.isRouteOrFollowup) {
    let originLoc: ResolvedLocation | null = activeJourney?.origin || null;
    let destLoc: ResolvedLocation | null = activeJourney?.destination || null;

    if (intent.originText) {
      const resOrig = await resolveLocationDynamic(intent.originText);
      quotaExceeded = quotaExceeded || resOrig.quotaExceeded;
      if (!resOrig.location) {
        return {
          reply: `I could not resolve the starting location **"${intent.originText}"** within Chandigarh or Mohali. Please check the spelling or specify a nearby sector, phase, or landmark (for example: *"Sector 17 Chandigarh"*, *"Chandigarh Railway Station"*, or *"Phase 8 Mohali"*).`,
          journey: activeJourney || null,
          groundedFacilitiesCount: 0,
          groundedReportsCount: 0,
          quotaExceeded,
        };
      }
      originLoc = resOrig.location;
    }

    if (intent.destinationText) {
      const resDest = await resolveLocationDynamic(intent.destinationText);
      quotaExceeded = quotaExceeded || resDest.quotaExceeded;
      if (!resDest.location) {
        return {
          reply: `I could not resolve the destination **"${intent.destinationText}"** within Chandigarh or Mohali. Please check the spelling or specify a nearby sector, phase, or landmark (for example: *"CGC University Mohali"*, *"Sukhna Lake"*, or *"Airport Road Mohali"*).`,
          journey: activeJourney || null,
          groundedFacilitiesCount: 0,
          groundedReportsCount: 0,
          quotaExceeded,
        };
      }
      destLoc = resDest.location;
    }

    if (originLoc && destLoc) {
      const nextMode: TravelMode = intent.travelMode || activeJourney?.mode || 'car';
      const nextTime = intent.timeOfTravel || activeJourney?.timeOfTravel;

      const computed = await computeSmartRoutesWithGoogleMaps({
        startLat: originLoc.latitude,
        startLng: originLoc.longitude,
        endLat: destLoc.latitude,
        endLng: destLoc.longitude,
        mode: nextMode,
        weights,
        allPois,
      });

      quotaExceeded = quotaExceeded || computed.quotaExceeded;

      if (computed.routes.length > 0) {
        const isNightQuery =
          intent.preference === 'higher_activity' ||
          (nextTime && /(night|pm|10|11|12|late)/i.test(nextTime));
        const isFastQuery = intent.preference === 'fastest';

        let preferredRoute = computed.routes[0];
        if (isNightQuery) {
          preferredRoute =
            computed.routes.find((r) => r.type === 'higher_activity') || computed.routes[0];
        } else if (isFastQuery) {
          preferredRoute =
            computed.routes.find((r) => r.type === 'fastest') || computed.routes[0];
        } else if (intent.preference === 'balanced') {
          preferredRoute =
            computed.routes.find((r) => r.type === 'balanced') || computed.routes[0];
        } else {
          preferredRoute =
            computed.routes.find((r) => r.type === 'higher_activity') || computed.routes[0];
        }

        updatedJourney = {
          origin: originLoc,
          destination: destLoc,
          mode: nextMode,
          timeOfTravel: nextTime,
          routes: computed.routes,
          selectedRouteId: preferredRoute.id,
          nearbyAlongRoute: computed.nearbyAlongRoutes,
        };

        const isCrimeFollowup = /\b(crime|theft|robbery|burglary|assault|historical)\b/i.test(
          prompt
        );

        if (!apiKey) {
          return {
            reply: isCrimeFollowup
              ? buildDeterministicIntelligenceReply(
                  prompt,
                  crimeRecords,
                  allPois,
                  originLoc.latitude,
                  originLoc.longitude,
                  updatedJourney
                )
              : buildDeterministicRouteExplanation(
                  updatedJourney,
                  preferredRoute,
                  intent.nearbyFacilityFocus
                ),
            journey: updatedJourney,
            groundedFacilitiesCount: computed.nearbyAlongRoutes.length,
            groundedReportsCount: allReports.length,
            quotaExceeded,
          };
        }

        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: { 'User-Agent': 'aistudio-build' },
            },
          });

          const routeTelemetryJson = computed.routes.map((r) => ({
            label: r.label,
            type: r.type,
            distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
            durationMinutes: Math.max(1, Math.round(r.durationSeconds / 60)),
            summaryRoads: r.summaryRoads,
            comparisonVsFastestText: r.comparisonVsFastestText,
            longestGapBetweenHelpPointsKm: r.nightActivity.longestGapBetweenHelpPointsKm,
            mainRoadCoveragePercentage: r.nightActivity.mainRoadCoveragePercentage,
            nightActivityScore: r.nightActivity.overallScore,
            confidencePercentage: r.nightActivity.confidencePercentage,
            factors: r.nightActivity.factors,
            nearbyCounts: r.nearbyPoisCount,
            infrastructureIntelligence: r.nightActivity.infrastructureIntelligence,
            crimeExposure: r.crimeExposure,
            sampleNearbyFacilities: (r.nearbyFacilitiesList || []).slice(0, 8).map((f) => ({
              name: f.name,
              category: f.category,
              address: f.address,
              openingHours: f.openingHours,
              phone: f.phone,
              source: f.source,
            })),
          }));

          const systemInstruction = `You are the UrbanShield Dynamic AI Route & City Intelligence Assistant for Chandigarh and Mohali, India.
You MUST ground every statement strictly in the real Google Maps Platform (Geocoding, Places API New, Routes API), OpenStreetMap, Chandigarh Smart City / GMADA infrastructure documentation, and Official NCRB / Police Historical Crime telemetry provided below.

CRITICAL RULES:
1. NEVER say a route is unavailable or restricted to a static database. The route has ALREADY been dynamically geocoded and calculated below.
2. State the exact resolved Origin ("${originLoc.name}" — ${originLoc.address}) and Destination ("${destLoc.name}" — ${destLoc.address}).
3. Compare the calculated routes (${computed.routes.map((r) => r.label).join(', ')}) using their exact distances (km), travel times (minutes), road summaries, Night Activity Scores (/100), longest gap between mapped help points (km), and nearby emergency/commercial facility counts.
4. Explain CCTV & Streetlight Epistemic Basis clearly: distinguish between individually verified cameras/multi-camera junctions (with estimated camera counts), documented Smart City surveillance zones, documented municipal streetlight corridors (MC Chandigarh / EESL / GMADA), estimated arterial lighting, and unknown segments. NEVER claim a location has no CCTV or streetlights simply because individual OSM pole records are absent.
5. Include Historical Crime Exposure along each route using the provided \`crimeExposure\` data: cite the reporting period (2020–2022), geographical resolution (district / police_station / sector), total recorded incidents in intersected jurisdictions, category breakdown, and any Insufficient Data areas.
6. Name specific verified hospitals, police stations, pharmacies, or establishments found along the route from the provided list.
7. Note that the Night Activity Score and Historical Crime Exposure are environmental & historical administrative indicators, not guarantees of personal safety.

CALCULATED JOURNEY DATA:
Origin: ${JSON.stringify(originLoc)}
Destination: ${JSON.stringify(destLoc)}
Travel Mode: ${nextMode}
Time Context: ${nextTime || 'Not specified'}
Recommended Route: ${preferredRoute.label}
Routes Telemetry: ${JSON.stringify(routeTelemetryJson, null, 2)}
Recent Community Reports: ${JSON.stringify(allReports.slice(0, 5), null, 2)}`;

          const historyContents = conversationHistory
            .slice(-6)
            .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
            .join('\n\n');

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4500);

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `${historyContents ? `Conversation History:\n${historyContents}\n\n` : ''}User Request: ${prompt}`,
            config: {
              abortSignal: controller.signal,
              systemInstruction,
            },
          });
          clearTimeout(timer);

          return {
            reply:
              response.text ||
              (isCrimeFollowup
                ? buildDeterministicIntelligenceReply(
                    prompt,
                    crimeRecords,
                    allPois,
                    originLoc.latitude,
                    originLoc.longitude,
                    updatedJourney
                  )
                : buildDeterministicRouteExplanation(
                    updatedJourney,
                    preferredRoute,
                    intent.nearbyFacilityFocus
                  )),
            journey: updatedJourney,
            groundedFacilitiesCount: computed.nearbyAlongRoutes.length,
            groundedReportsCount: allReports.length,
            quotaExceeded,
          };
        } catch {
          return {
            reply: isCrimeFollowup
              ? buildDeterministicIntelligenceReply(
                  prompt,
                  crimeRecords,
                  allPois,
                  originLoc.latitude,
                  originLoc.longitude,
                  updatedJourney
                )
              : buildDeterministicRouteExplanation(
                  updatedJourney,
                  preferredRoute,
                  intent.nearbyFacilityFocus
                ),
            journey: updatedJourney,
            groundedFacilitiesCount: computed.nearbyAlongRoutes.length,
            groundedReportsCount: allReports.length,
            quotaExceeded,
          };
        }
      }
    }
  }

  // Case 2: General City Safety / Historical Crime / CCTV & Streetlight / Nearby Facilities Query
  const refLat = updatedJourney?.origin.latitude ?? userLocation.lat;
  const refLng = updatedJourney?.origin.longitude ?? userLocation.lng;

  const nearestPois = allPois
    .map((p) => ({
      ...p,
      distKm: Number(haversineDistanceKm(refLat, refLng, p.latitude, p.longitude).toFixed(2)),
    }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 16);

  const recentReports = allReports.slice(0, 8);

  const fallbackGeneralReply = buildDeterministicIntelligenceReply(
    prompt,
    crimeRecords,
    allPois,
    refLat,
    refLng,
    updatedJourney
  );

  if (!apiKey) {
    return {
      reply: fallbackGeneralReply,
      journey: updatedJourney,
      groundedFacilitiesCount: nearestPois.length + crimeRecords.length,
      groundedReportsCount: recentReports.length,
      quotaExceeded,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const systemContext = `You are the UrbanShield AI City Intelligence Assistant for Chandigarh and Mohali, India.
Ground every answer strictly in the verified facilities, CCTV/Streetlight infrastructure tiers, Historical Crime Statistics database records, active journey context, and community reports below.

CRITICAL EPISTEMIC & DATA INTEGRITY RULES:
1. CCTV & Streetlight Intelligence:
   - Distinguish clearly between: (a) Individually verified camera/streetlight nodes, (b) Verified multi-camera CCTV junctions (where 1 junction = 6 to 12 physical ANPR/RLVD/PTZ cameras), (c) Documented Smart City surveillance zones (Chandigarh ICCC / CSCL / SAS Nagar Police) and Documented municipal streetlight corridors (MC Chandigarh / EESL / GMADA), (d) Estimated arterial lighting, and (e) Unknown coverage areas.
   - NEVER claim that a sector or road has no CCTV or streetlights simply because individual OpenStreetMap pole records are absent.
2. Historical Crime Hotspot Intelligence:
   - Ground all crime answers strictly in the \`HISTORICAL_CRIME_STATISTICS\` records below (NCRB Crime in India 2020–2022, Chandigarh Administration Statistical Abstract, Chandigarh Police & SAS Nagar Police station/sector records).
   - Always cite the exact data source (\`sourceName\`), reporting years (\`year\`), and geographical granularity (\`district\`, \`police_station\`, or \`sector\`).
   - Preserve original granularity: never artificially distribute district-level counts across sectors, and explicitly identify areas in \`INSUFFICIENT_CRIME_DATA_ZONES\` as having "Insufficient Data" (never "Low Crime").
3. Distinguish between VERIFIED facilities (Google Places API / OpenStreetMap) and USER-SUBMITTED community reports.

USER COORDINATES: ${userLocation.lat.toFixed(4)}° N, ${userLocation.lng.toFixed(4)}° E
ACTIVE JOURNEY CONTEXT: ${
      updatedJourney
        ? `${updatedJourney.origin.name} to ${updatedJourney.destination.name} (${updatedJourney.mode})`
        : selectedRouteSummary || 'None'
    }
DOCUMENTED CCTV SURVEILLANCE ZONES:
${JSON.stringify(DOCUMENTED_CCTV_COVERAGE_ZONES, null, 2)}
DOCUMENTED STREETLIGHT CORRIDORS:
${JSON.stringify(DOCUMENTED_STREETLIGHT_CORRIDORS, null, 2)}
HISTORICAL_CRIME_STATISTICS (Official 2020-2022 Records):
${JSON.stringify(
  crimeRecords.map((r) => ({
    year: r.year,
    district: r.district,
    policeStation: r.policeStation,
    sector: r.sector,
    category: r.crimeCategory,
    count: r.incidentCount,
    level: r.geographicLevel,
    source: r.sourceName,
  })),
  null,
  2
)}
INSUFFICIENT_CRIME_DATA_ZONES:
${JSON.stringify(INSUFFICIENT_CRIME_DATA_ZONES, null, 2)}
NEAREST VERIFIED FACILITIES:
${JSON.stringify(nearestPois, null, 2)}
RECENT COMMUNITY REPORTS:
${JSON.stringify(recentReports, null, 2)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt.trim(),
      config: {
        abortSignal: controller.signal,
        systemInstruction: systemContext,
      },
    });
    clearTimeout(timer);

    return {
      reply: response.text || fallbackGeneralReply,
      journey: updatedJourney,
      groundedFacilitiesCount: nearestPois.length + crimeRecords.length,
      groundedReportsCount: recentReports.length,
      quotaExceeded,
    };
  } catch {
    return {
      reply: fallbackGeneralReply,
      journey: updatedJourney,
      groundedFacilitiesCount: nearestPois.length + crimeRecords.length,
      groundedReportsCount: recentReports.length,
      quotaExceeded,
    };
  }
}
