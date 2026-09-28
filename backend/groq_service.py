import os
from typing import Any


def _get_model_name() -> str:
    return os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")


def generate_ai_response(system_prompt: str, user_message: str, context: dict[str, Any] | None = None) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError("GROQ_API_KEY is not configured")

    try:
        from groq import Groq
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError("Groq SDK is not installed") from exc

    try:
        client = Groq(api_key=api_key)
        payload = {
            "model": _get_model_name(),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"User question: {user_message}\n\nStructured VAANKAN context:\n{context or {}}"},
            ],
            "temperature": 0.2,
            "max_tokens": 500,
            "timeout": 20,
        }
        response = client.chat.completions.create(**payload)
        text = response.choices[0].message.content if response and response.choices else ""
        cleaned = str(text or "").strip()
        return cleaned or "I don't have sufficient VAANKAN data to determine that."
    except Exception as exc:  # pragma: no cover - network and provider specific
        status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
        if status_code in {401, 403}:
            raise RuntimeError("AI access is not authorized for this request.") from exc
        if status_code == 429:
            raise RuntimeError("AI rate limit reached. Please try again shortly.") from exc
        if status_code in {500, 502, 503}:
            raise RuntimeError("Groq is temporarily unavailable.") from exc
        raise RuntimeError("Groq is temporarily unavailable. Please try again shortly.") from exc
