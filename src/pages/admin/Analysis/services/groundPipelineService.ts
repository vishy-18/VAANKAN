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
  mode: "DATABASE" | "NOT_CONNECTED";
  observations: GroundObservationRecord[];
  events: CorrelatedWeatherEvent[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";

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
    return { mode: "DATABASE", observations, events };
  } catch {
    return { mode: "NOT_CONNECTED", observations: [], events: [] };
  }
}