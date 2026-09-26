export interface NotificationDispatchRequest {
  report_id: string;
  email: string;
  phone: string;
  subject: string;
  body: string;
}

export interface NotificationDispatchResult {
  report_id: string;
  email: string;
  sms: string;
  sent: boolean;
  errors: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function dispatchNotification(
  payload: NotificationDispatchRequest,
): Promise<NotificationDispatchResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${API_BASE}/api/notifications/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        report_id: payload.report_id,
        email: `http_${response.status}`,
        sms: `http_${response.status}`,
        sent: false,
        errors: [`Notification API returned ${response.status}`],
      };
    }
    return await response.json() as NotificationDispatchResult;
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Notification request timed out"
      : "Notification API is unavailable";
    return { report_id: payload.report_id, email: "api_unavailable", sms: "api_unavailable", sent: false, errors: [message] };
  } finally {
    window.clearTimeout(timeout);
  }
}