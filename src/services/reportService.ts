export type ApiVerificationStatus = "PENDING" | "VERIFIED" | "SUSPICIOUS" | "UNSUPPORTED";
export type ApiEventType = "rainfall" | "thunderstorm" | "flooding" | "heatwave" | "fog" | "dust_storm" | "strong_winds";

export interface ApiReport {
  record_id: string;
  source_type: string;
  source_name: string;
  timestamp: string;
  text: string;
  language: string;
  latitude: number;
  longitude: number;
  city: string;
  district: string;
  state: string;
  event_type_claimed: ApiEventType;
  image_url?: string | null;
  video_url?: string | null;
  verification_status: ApiVerificationStatus;
}

export interface ApiSubmission {
  submission_id: string;
  report_id: string;
  report_title: string;
  location?: string;
  event_type?: string;
  previous_status: string;
  new_status: string;
  reason: string;
  operator: string;
  timestamp: string;
  notified_count: number;
  email_status: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; offline: boolean };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 8_000;

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      return { ok: false, error: `API request failed (${response.status})`, offline: false };
    }
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "AbortError" ? "API request timed out" : "API is unavailable",
      offline: true,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function listReports(options: {
  eventType?: string;
  verificationStatus?: ApiVerificationStatus;
  region?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ApiResult<ApiReport[]>> {
  const params = new URLSearchParams();
  if (options.eventType) params.set("event_type", options.eventType);
  if (options.verificationStatus) params.set("verification_status", options.verificationStatus);
  if (options.region) params.set("region", options.region);
  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));
  return request(`/api/reports?${params.toString()}`);
}

export function getReport(reportId: string): Promise<ApiResult<ApiReport>> {
  return request(`/api/reports/${encodeURIComponent(reportId)}`);
}

export function createReport(report: ApiReport): Promise<ApiResult<ApiReport>> {
  return request("/api/reports", { method: "POST", body: JSON.stringify(report) });
}

export function submitVerification(
  reportId: string,
  status: ApiVerificationStatus,
  reason: string,
  operator = "Admin Operator",
): Promise<ApiResult<ApiSubmission>> {
  return request(`/api/admin/reports/${encodeURIComponent(reportId)}/submit-verification`, {
    method: "POST",
    body: JSON.stringify({ status, reason, operator }),
  });
}

export function listSubmissionHistory(): Promise<ApiResult<ApiSubmission[]>> {
  return request("/api/admin/submission-history");
}

export function listNearbyReports(options: {
  latitude: number;
  longitude: number;
  radiusKm: number;
  verificationStatus?: ApiVerificationStatus;
  eventType?: string;
  limit?: number;
}): Promise<ApiResult<ApiReport[]>> {
  const params = new URLSearchParams({
    latitude: String(options.latitude),
    longitude: String(options.longitude),
    radius_km: String(options.radiusKm),
    limit: String(options.limit ?? 100),
  });
  if (options.verificationStatus) params.set("verification_status", options.verificationStatus);
  if (options.eventType) params.set("event_type", options.eventType);
  return request(`/api/reports/nearby?${params.toString()}`);
}