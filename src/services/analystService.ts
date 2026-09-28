import type { ApiReport } from "./reportService";
import { listReports } from "./reportService";
import type {
  AnalysisFilters,
  CitizenAnalysisReport,
  EventCategory,
  SeverityLevel,
} from "../pages/admin/Analysis/types";

export interface AnalystEvent {
  eventId: string;
  eventType: string;
  title: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;
  severity: SeverityLevel | "UNASSESSED";
  confidence: number | null;
  affectedRadiusKm: number | null;
  reportCount: number;
  verifiedReportCount: number;
  suspiciousReportCount: number;
  rainfallMm: number | null;
  temperatureC: number | null;
  windSpeedKmh: number | null;
  visibilityKm?: number | null;
  anomalyScore: number | null;
  verificationStatus: "VERIFIED" | "PENDING" | "SUSPICIOUS" | "UNSUPPORTED" | "VERIFIED_AND_SUBMITTED_TO_VAYU" | "UNASSESSED";
  source: string;
  isDemo: boolean;
  eventStatus?: string;
  timeline?: { time: string; event: string }[];
  evidence?: { name: string; type: string; detail: string }[];
}

export interface AnalystWeatherObservation {
  observationId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  rainfallMm: number | null;
  rainfallAnomalyMm: number | null;
  rainfallAnomalyRatio: number | null;
  temperatureAnomalyC: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  pressureHpa: number | null;
  visibilityKm: number | null;
  weatherCondition: string | null;
  weatherAnomalyScore: number | null;
  freshnessStatus: string;
  dataMode: string;
  baselineSource: string | null;
}

export interface AnalystDataset {
  events: AnalystEvent[];
  weatherObservations: AnalystWeatherObservation[];
  reports: CitizenAnalysisReport[];
  mode: "LIVE" | "DEGRADED" | "FALLBACK" | "NOT_CONNECTED";
  updatedAt: string;
}

export const DEFAULT_ANALYST_FILTERS: AnalysisFilters = {
  dateRange: "Custom",
  eventType: "All",
  state: "All",
  district: "All",
  severity: "All",
  dataSource: "All",
  verificationStatus: "All",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";
const EVENT_LABELS: Record<string, EventCategory> = {
  rainfall: "Heavy Rainfall",
  thunderstorm: "Thunderstorm",
  flooding: "Flood",
  heatwave: "Heatwave",
  fog: "Fog",
  dust_storm: "Dust Storm",
  strong_winds: "Strong Wind",
};

const API_EVENT_TYPES: Record<string, string> = {
  "Heavy Rainfall": "rainfall",
  Thunderstorm: "thunderstorm",
  Flood: "flooding",
  Heatwave: "heatwave",
  Fog: "fog",
  "Dust Storm": "dust_storm",
  "Strong Wind": "strong_winds",
  Cyclone: "cyclone",
};

function analystSource(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes("citizen") || normalized.includes("admin_review")) return "Citizen";
  if (normalized.includes("social")) return "Social Media";
  if (normalized.includes("website") || normalized.includes("web")) return "Website";
  if (normalized.includes("public")) return "Public Dataset";
  if (normalized.includes("weather_api") || normalized.includes("weather api")) return "Weather API";
  if (normalized.includes("imd")) return "IMD";
  if (normalized.includes("satellite")) return "Satellite";
  if (normalized.includes("radar")) return "Radar";
  return source;
}

async function fetchApiWeatherObservations(): Promise<{ observations: AnalystWeatherObservation[]; mode: AnalystDataset["mode"]; updatedAt: string }> {
  const response = await fetch(`${API_BASE}/api/weather/current`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Weather endpoint returned ${response.status}`);
  const data = await response.json() as {
    data_mode: AnalystDataset["mode"];
    updated_at?: string;
    observations: Array<Record<string, unknown>>;
  };
  return {
    mode: data.data_mode,
    updatedAt: data.updated_at ?? new Date().toISOString(),
    observations: data.observations.map((item) => ({
      observationId: String(item.observation_id ?? ""),
      timestamp: String(item.timestamp ?? ""),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      city: String(item.city ?? "Unknown"),
      district: String(item.district ?? "Unknown"),
      state: String(item.state ?? "Unknown"),
      temperatureC: nullableNumber(item.temperature_c),
      feelsLikeC: nullableNumber(item.feels_like_c),
      humidityPercent: nullableNumber(item.humidity_percent),
      rainfallMm: nullableNumber(item.rainfall_1h_mm ?? item.rainfall_mm),
      rainfallAnomalyMm: nullableNumber(item.rainfall_anomaly_mm),
      rainfallAnomalyRatio: nullableNumber(item.rainfall_anomaly_ratio),
      temperatureAnomalyC: nullableNumber(item.temperature_anomaly_c),
      windSpeedKmh: nullableNumber(item.wind_speed_kmh),
      windGustKmh: nullableNumber(item.wind_gust_kmh),
      pressureHpa: nullableNumber(item.pressure_hpa),
      visibilityKm: nullableNumber(item.visibility_km),
      weatherCondition: typeof item.weather_condition === "string" ? item.weather_condition : null,
      weatherAnomalyScore: nullableNumber(item.weather_anomaly_score),
      freshnessStatus: String(item.freshness_status ?? "UNKNOWN"),
      dataMode: String(item.data_mode ?? data.data_mode),
      baselineSource: typeof item.baseline_source === "string" ? item.baseline_source : null,
    })),
  };
}

async function fetchApiEventCandidates(filters: AnalysisFilters, observations: AnalystWeatherObservation[]): Promise<AnalystEvent[]> {
  const params = new URLSearchParams();
  if (filters.state !== "All") params.set("state", filters.state);
  const response = await fetch(`${API_BASE}/api/events?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`VAYU candidate endpoint returned ${response.status}`);
  const data = await response.json() as { events: Array<Record<string, unknown>> };
  return data.events.map((candidate) => {
    const candidateType = String(candidate.event_type ?? "Other");
    const linkedIds = Array.isArray(candidate.locations) ? candidate.locations.map(String) : [];
    const linkedObservations = observations.filter((observation) => linkedIds.includes(observation.observationId.split(":")[1]));
    const latitude = nullableNumber(candidate.latitude) ?? linkedObservations.reduce((sum, observation) => sum + observation.latitude, 0) / Math.max(linkedObservations.length, 1);
    const longitude = nullableNumber(candidate.longitude) ?? linkedObservations.reduce((sum, observation) => sum + observation.longitude, 0) / Math.max(linkedObservations.length, 1);
    const firstObservation = linkedObservations[0];
    return {
      eventId: String(candidate.candidate_id ?? ""),
      eventType: candidateType,
      title: String(candidate.title ?? candidateType.replaceAll("_", " ")),
      timestamp: String(candidate.timestamp ?? new Date().toISOString()),
      latitude,
      longitude,
      city: String(candidate.city ?? firstObservation?.city ?? "Regional cluster"),
      district: String(candidate.district ?? firstObservation?.district ?? "Multiple districts"),
      state: String(candidate.state ?? firstObservation?.state ?? "Multiple states"),
      severity: "UNASSESSED",
      confidence: null,
      affectedRadiusKm: null,
      reportCount: Number(candidate.report_count ?? 0),
      verifiedReportCount: Number(candidate.verified_report_count ?? 0),
      suspiciousReportCount: Number(candidate.suspicious_report_count ?? 0),
      rainfallMm: null,
      temperatureC: null,
      windSpeedKmh: null,
      anomalyScore: null,
      verificationStatus: "UNASSESSED",
      source: String(candidate.source ?? "Open-Meteo"),
      isDemo: candidate.data_mode !== "LIVE",
      eventStatus: String(candidate.event_status ?? candidate.status ?? "DETECTED"),
      timeline: Array.isArray(candidate.timeline) ? candidate.timeline.map((entry) => ({
        time: String((entry as Record<string, unknown>).timestamp ?? ""),
        event: String((entry as Record<string, unknown>).stage ?? "DETECTED"),
      })) : [],
      evidence: [{ name: String(candidate.candidate_id ?? "VAYU candidate"), type: "Deterministic VAYU analysis", detail: String(candidate.trigger_reason ?? "Candidate criteria were met.") }],
    };
  });
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function reportToCitizenReport(report: ApiReport): CitizenAnalysisReport {
  const eventCategory = EVENT_LABELS[report.event_type_claimed] ?? "Heavy Rainfall";
  return {
    reportId: report.record_id,
    timestamp: report.timestamp,
    userEmail: report.source_name,
    source: analystSource(report.source_type),
    city: report.city,
    district: report.district,
    state: report.state,
    latitude: report.latitude,
    longitude: report.longitude,
    category: eventCategory,
    text: report.text,
    status: report.verification_status,
    confidence: null,
  };
}

export async function getAnalystDataset(filters: AnalysisFilters = DEFAULT_ANALYST_FILTERS): Promise<AnalystDataset> {
  try {
    const weather = await fetchApiWeatherObservations();
    const [eventsResult, reportsResult] = await Promise.all([
      fetchApiEventCandidates(filters, weather.observations).catch(() => []),
      listReports({
        eventType: filters.eventType === "All" ? undefined : API_EVENT_TYPES[filters.eventType] ?? filters.eventType.toLowerCase(),
        verificationStatus: filters.verificationStatus === "All" ? undefined : filters.verificationStatus as ApiReport["verification_status"],
        region: filters.state === "All" ? undefined : filters.state,
        limit: 500,
      }),
    ]);
    return {
      events: eventsResult,
      weatherObservations: weather.observations,
      reports: reportsResult.ok ? reportsResult.data.map(reportToCitizenReport) : [],
      mode: weather.mode,
      updatedAt: weather.updatedAt,
    };
  } catch {
    return {
      events: [],
      weatherObservations: [],
      reports: [],
      mode: "NOT_CONNECTED",
      updatedAt: new Date().toISOString(),
    };
  }
}
