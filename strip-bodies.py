"""mitmproxy addon: sanitize auth tokens from flows for safe sharing."""
import re

from mitmproxy import http


def _sanitize_auth(value: str) -> str:
    """Redact sensitive token values while preserving structure."""
    if value.startswith("Bearer "):
        if value.startswith("Bearer gho_"):
            return "Bearer gho_<REDACTED>"
        if "tid=" in value:
            # Redact tid, keep metadata (sku, features, etc.)
            redacted = re.sub(r"tid=[^;]+", "tid=<REDACTED>", value)
            # Redact trailing signature (64-char hex after last colon)
            redacted = re.sub(r":[0-9a-f]{64}$", ":<REDACTED>", redacted)
            return redacted
        return "Bearer <REDACTED>"
    if value.startswith("Basic "):
        return "Basic <REDACTED>"
    return value


def request(flow: http.HTTPFlow) -> None:
    if not flow.request:
        return
    # Strip large request bodies
    if flow.request.content and len(flow.request.content) > 2048:
        flow.request.content = f"[stripped: {len(flow.request.content)} bytes]".encode()
    # Redact auth headers
    if auth := flow.request.headers.get("authorization"):
        flow.request.headers["authorization"] = _sanitize_auth(auth)


def response(flow: http.HTTPFlow) -> None:
    if not flow.response:
        return
    # Strip large response bodies
    if flow.response.content and len(flow.response.content) > 1024:
        flow.response.content = f"[stripped: {len(flow.response.content)} bytes]".encode()
