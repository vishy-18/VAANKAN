export interface AiSource {
  type: string;
  id: string;
}

export interface AiResponse {
  conversation_id: string;
  message: string;
  sources: AiSource[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";

async function requestAi(path: string, payload: Record<string, unknown>, roleHeader?: "citizen" | "analyst") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (roleHeader) {
    headers["x-role"] = roleHeader;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: "AI request failed" }));
    throw new Error(detail.detail ?? "AI request failed");
  }
  return (await response.json()) as AiResponse;
}

export async function sendCitizenAssistantMessage(message: string, conversationId?: string, locationLabel?: string) {
  return requestAi(
    "/api/ai/citizen/chat",
    {
      message,
      conversation_id: conversationId ?? `citizen-${Date.now()}`,
      location_label: locationLabel ?? undefined,
    },
    "citizen",
  );
}

export async function sendAnalystCopilotMessage(message: string, eventId?: string, conversationId?: string) {
  return requestAi(
    "/api/ai/analyst/chat",
    {
      message,
      conversation_id: conversationId ?? `analyst-${Date.now()}`,
      event_id: eventId ?? undefined,
    },
    "analyst",
  );
}
