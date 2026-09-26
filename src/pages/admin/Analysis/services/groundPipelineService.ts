import type { EventCategory } from "../types";
import { mockCitizenReports } from "../data/mockAnalysisData";

export interface GroundObservationRecord {
  observation_id: string;
  source: "ADMIN_REVIEW";
  report_id: string;
  event_type: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;
  verification_status: "VERIFIED";
  verification_method: "admin";
  verification_confidence: number | null;
}

export interface CorrelatedWeatherEvent {
  event_id: string;
  event_type: string;
  title: string;
  city: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  first_seen_at: string;
  last_updated_at: string;
  status: "DETECTED" | "CORRELATED" | "ACTIVE";
  severity: "UNASSESSED";
  verified_report_count: number;
  verified_media_count: number;
  observation_ids: string[];
  meteorological_evidence: Record<string, number | null>;
  vayu_analysis: Record<string, number | null>;
  data_mode: "DEMO";
}

export interface GroundPipelineData {
  mode: "FASTAPI DEMO" | "MOCK FALLBACK";
  observations: GroundObservationRecord[];
  events: CorrelatedWeatherEvent[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const eventTypeMap: Record<EventCategory, string> = {
  "Heavy Rainfall": "rainfall",
  Thunderstorm: "thunderstorm",
  Flood: "flooding",
  Heatwave: "heatwave",
  Fog: "fog",
  "Dust Storm": "dust_storm",
  "Strong Wind": "strong_winds",
  Lightning: "thunderstorm",
  Hailstorm: "thunderstorm",
  Cyclone: "strong_winds",
};

function getMockFallback(): GroundPipelineData {
  const observations: GroundObservationRecord[] = mockCitizenReports
    .filter((report) => report.status === "VERIFIED")
    .map((report) => ({
      observation_id: `GO-${report.reportId}`,
      source: "ADMIN_REVIEW",
      report_id: report.reportId,
      event_type: eventTypeMap[report.category],
      timestamp: report.timestamp,
      latitude: report.latitude,
      longitude: report.longitude,
      city: report.city,
      district: report.district,
      state: report.state,
      verification_status: "VERIFIED",
      verification_method: "admin",
      verification_confidence: null,
    }));

  const events = observations.map<CorrelatedWeatherEvent>((observation) => {
    const members = observations.filter((candidate) =>
      candidate.event_type === observation.event_type &&
      candidate.district === observation.district &&
      candidate.state === observation.state,
    );
    const center = members[0];
    return {
      event_id: `EVT-${center.report_id}`,
      event_type: center.event_type,
      title: `Verified ${center.event_type.replaceAll("_", " ")} observations`,
      city: center.city,
      district: center.district,
      state: center.state,
      latitude: center.latitude,
      longitude: center.longitude,
      first_seen_at: members.reduce((first, item) => item.timestamp < first ? item.timestamp : first, center.timestamp),
      last_updated_at: members.reduce((last, item) => item.timestamp > last ? item.timestamp : last, center.timestamp),
      status: members.length > 1 ? "CORRELATED" : "DETECTED",
      severity: "UNASSESSED",
      verified_report_count: members.length,
      verified_media_count: 0,
      observation_ids: members.map((item) => item.observation_id),
      meteorological_evidence: {
        rainfall_24h_mm: null,
        temperature_c: null,
        humidity_percent: null,
        wind_speed_kmh: null,
        pressure_hpa: null,
        visibility_km: null,
      },
      vayu_analysis: {
        anomaly_score: null,
        event_confidence: null,
        severity_score: null,
      },
      data_mode: "DEMO",
    };
  }).filter((event, index, all) => all.findIndex((candidate) => candidate.event_id === event.event_id) === index);

  return { mode: "MOCK FALLBACK", observations, events };
}

export async function getGroundPipelineData(): Promise<GroundPipelineData> {
  try {
    const [observationsResponse, eventsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/vayu/ground-observations`),
      fetch(`${API_BASE}/api/vayu/events`),
    ]);
    if (!observationsResponse.ok || !eventsResponse.ok) {
      throw new Error("VAYU pipeline endpoints unavailable");
    }
    const [observations, events] = await Promise.all([
      observationsResponse.json() as Promise<GroundObservationRecord[]>,
      eventsResponse.json() as Promise<CorrelatedWeatherEvent[]>,
    ]);
    return { mode: "FASTAPI DEMO", observations, events };
  } catch {
    return getMockFallback();
  }
}