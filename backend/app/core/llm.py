"""LLM interface — Gemini via langchain-google-genai (architecture.md §7).

The client is constructed once and kept for the process lifetime so per-request
TLS/DNS setup is never paid (§4.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator

from ..config import LLMCfg

# gemini-2.0-flash list price (USD per token) — used for the est-cost stat.
COST_PER_INPUT_TOKEN = 0.10 / 1_000_000
COST_PER_OUTPUT_TOKEN = 0.40 / 1_000_000


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def est_cost_usd(self) -> float:
        return (
            self.input_tokens * COST_PER_INPUT_TOKEN
            + self.output_tokens * COST_PER_OUTPUT_TOKEN
        )


@dataclass
class StreamResult:
    """Filled in as the stream is consumed; final after the iterator ends."""

    text: str = ""
    usage: Usage = field(default_factory=Usage)


class GeminiLLM:
    def __init__(self, cfg: LLMCfg, api_key: str):
        self.cfg = cfg
        self.model = cfg.model
        self._api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not self._api_key:
                raise RuntimeError("GEMINI_API_KEY is not set")
            from langchain_google_genai import ChatGoogleGenerativeAI

            self._client = ChatGoogleGenerativeAI(
                model=self.cfg.model,
                temperature=self.cfg.temperature,
                max_output_tokens=self.cfg.max_output_tokens,
                google_api_key=self._api_key,
            )
        return self._client

    def warm(self) -> None:
        """Construct the client ahead of the first request (no API call)."""
        if self._api_key:
            self._get_client()

    async def stream(
        self, messages: list[tuple[str, str]], result: StreamResult
    ) -> AsyncIterator[str]:
        """Yield text deltas; accumulate full text + token usage in `result`."""
        client = self._get_client()
        async for chunk in client.astream(messages):
            usage = getattr(chunk, "usage_metadata", None)
            if usage:
                result.usage.input_tokens = usage.get("input_tokens", 0) or 0
                result.usage.output_tokens = usage.get("output_tokens", 0) or 0
            text = chunk.content if isinstance(chunk.content, str) else ""
            if text:
                result.text += text
                yield text
        if result.usage.output_tokens == 0:
            # fallback estimate when the provider omits usage metadata
            result.usage.output_tokens = max(1, len(result.text) // 4)

    async def complete(self, messages: list[tuple[str, str]]) -> tuple[str, Usage]:
        client = self._get_client()
        msg = await client.ainvoke(messages)
        usage = getattr(msg, "usage_metadata", None) or {}
        text = msg.content if isinstance(msg.content, str) else str(msg.content)
        return text, Usage(
            input_tokens=usage.get("input_tokens", 0) or 0,
            output_tokens=usage.get("output_tokens", 0) or max(1, len(text) // 4),
        )
