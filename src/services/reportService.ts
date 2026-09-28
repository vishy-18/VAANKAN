export type ApiVerificationStatus = "PENDING" | "VERIFIED" | "SUSPICIOUS" | "UNSUPPORTED" | "VERIFIED_AND_SUBMITTED_TO_VAYU";
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
  submitted?: boolean;
  submitted_at?: string | null;
  citizen_id?: string | null;
  description?: string | null;
  locality?: string | null;
  pincode?: string | null;
  citizen_reported_severity?: string | null;
  is_ongoing?: boolean | null;
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
  submitted?: boolean;
}

export interface ApiCitizenAlert {
  alert_id: string;
  report_id: string;
  title: string;
  severity: string;
  location: string;
  acknowledged: boolean;
  source: string;
  timestamp: string;
  age_hours: number;
  event_type: string;
  latitude: number;
  longitude: number;
  email_status: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; offline: boolean };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";
const REQUEST_TIMEOUT_MS = 8_000;
const validationFieldLabels: Record<string, string> = {
  name: "Full name",
  email: "Email address",
  password: "Password",
  address: "Address",
  phone: "Phone number",
  government_id: "Government ID",
};

function validationMessage(field: string | number | undefined, message: string): string {
  const label = validationFieldLabels[String(field)] ?? "Request";
  const minimum = message.match(/at least (\d+) characters?/i);
  const maximum = message.match(/at most (\d+) characters?/i);
  if (minimum) return `${label} must be at least ${minimum[1]} characters`;
  if (maximum) return `${label} must be no more than ${maximum[1]} characters`;
  if (/field required/i.test(message)) return `${label} is required`;
  if (/valid email/i.test(message)) return `${label} must be a valid email address`;
  return `${label}: ${message}`;
}

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
      const payload = await response.json().catch(() => null) as {
        detail?: string | Array<{ loc?: Array<string | number>; msg?: string }>;
      } | null;
      const detail = Array.isArray(payload?.detail)
        ? payload.detail.map((item) => {
            const field = item.loc?.at(-1);
            return validationMessage(field, item.msg ?? "is invalid");
          }).join("; ")
        : payload?.detail;
      if (response.status === 401) {
        return { ok: false, error: "Email or password is incorrect.", offline: false };
      }
      if (response.status === 409 && typeof detail === "string") {
        return { ok: false, error: detail, offline: false };
      }
      if (response.status === 422 && !detail) {
        return { ok: false, error: "Some fields are invalid. Check the required format and character limits.", offline: false };
      }
      return { ok: false, error: detail || `Request failed (HTTP ${response.status})`, offline: false };
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

export function listCitizenReports(citizenId: string): Promise<ApiResult<ApiReport[]>> {
  const params = new URLSearchParams({ citizen_id: citizenId });
  return request(`/api/citizen/reports?${params.toString()}`);
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

export function submitToVayu(reportId: string): Promise<ApiResult<{ report_id: string; status: string; submitted: boolean; submitted_at: string | null; vayu_status: string; verified_ground_observation_id: string; alert_id: string | null; notified_count: number; email_status: string; message: string }>> {
  return request(`/api/admin/reports/${encodeURIComponent(reportId)}/submit-to-vayu`, {
    method: "POST",
  });
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

export interface CitizenAccount {
  user_id: string;
  email: string;
  name: string;
  phone: string;
  government_id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  access_token?: string;
  token_type?: string;
}

export interface CitizenActivity {
  id: string;
  citizen_id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  related_id: string | null;
  status: string;
}

export function registerCitizen(account: {
  name: string;
  email: string;
  password: string;
  address: string;
  phone: string;
  government_id: string;
}): Promise<ApiResult<CitizenAccount>> {
  return request("/api/auth/citizen/register", { method: "POST", body: JSON.stringify(account) });
}

export function loginCitizen(email: string, password: string): Promise<ApiResult<CitizenAccount>> {
  return request("/api/auth/citizen/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function updateCitizenProfile(
  citizenId: string,
  updates: Partial<Pick<CitizenAccount, "name" | "phone" | "address" | "government_id" | "latitude" | "longitude">>,
): Promise<ApiResult<CitizenAccount>> {
  return request("/api/citizen/profile", {
    method: "PATCH",
    headers: { "X-Citizen-Id": citizenId },
    body: JSON.stringify(updates),
  });
}

export function listCitizenActivities(citizenId: string): Promise<ApiResult<CitizenActivity[]>> {
  const params = new URLSearchParams({ citizen_id: citizenId });
  return request(`/api/citizen/activities?${params.toString()}`);
}

export function acknowledgeCitizenAlert(citizenId: string, alertId: string): Promise<ApiResult<{
  acknowledged: boolean;
  already_acknowledged: boolean;
  acknowledged_at?: string;
}>> {
  return request(`/api/citizen/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: "POST",
    headers: { "X-Citizen-Id": citizenId },
    body: JSON.stringify({ citizen_id: citizenId }),
  });
}

export function seedSampleEvents(): Promise<ApiResult<{
  created_count: number;
  existing_count: number;
  pending_review_count: number;
  pending_near_target_count: number;
  center: { latitude: number; longitude: number };
  created_record_ids: string[];
  message: string;
}>> {
  return request("/api/admin/sample-events", { method: "POST" });
}

export function listCitizenAlerts(citizenId: string): Promise<ApiResult<ApiCitizenAlert[]>> {
  const params = new URLSearchParams({ citizen_id: citizenId });
  return request(`/api/citizen/alerts?${params.toString()}`);
}