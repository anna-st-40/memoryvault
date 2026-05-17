import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_TIMEOUT_SEC = int(os.getenv("OLLAMA_TIMEOUT_SEC", "120"))


class OllamaUnavailableError(RuntimeError):
    """Raised when the Ollama service cannot be reached."""


def chat(
    system_prompt: str,
    user_prompt: str,
    model: str = OLLAMA_MODEL,
    timeout: int = OLLAMA_TIMEOUT_SEC,
) -> str:
    """
    POST to Ollama /api/chat and return the assistant response as a string.
    Uses stdlib urllib to avoid adding a new dependency.
    """
    payload = json.dumps({
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
    except (urllib.error.URLError, OSError) as exc:
        raise OllamaUnavailableError(
            f"Could not reach Ollama at {OLLAMA_URL}: {exc}"
        ) from exc

    try:
        data = json.loads(body)
        return data["message"]["content"]
    except (KeyError, json.JSONDecodeError) as exc:
        raise ValueError(f"Unexpected Ollama response format: {body[:200]}") from exc
