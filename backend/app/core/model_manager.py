"""ModelManager — owns the single shared embedder and its warm-up policy
(architecture.md §5).

Modes (config embedding.warm):
  startup      — loaded once at boot, resident forever (default).
  on_link_open — loaded when /api/warm fires on link open; optional idle unload.
  lazy         — loaded on first actual use.

Guardrails: load is serialized behind a lock (requests arriving mid-load wait
instead of triggering a second load), a refcount prevents unloading
mid-request, and idle unload is debounced by idle_unload_seconds.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from ..config import EmbeddingCfg
from .embedder import Embedder, build_embedder

log = logging.getLogger("ekp.model")


class ModelManager:
    def __init__(self, cfg: EmbeddingCfg):
        self.cfg = cfg
        self._embedder: Embedder | None = None
        self._lock = asyncio.Lock()
        self._refs = 0
        self._last_used = time.monotonic()
        self._idle_task: asyncio.Task | None = None

    @property
    def loaded(self) -> bool:
        return self._embedder is not None

    async def ensure_warm(self) -> None:
        """Called by /api/warm and at startup (per policy)."""
        await self._get()

    async def _get(self) -> Embedder:
        self._last_used = time.monotonic()
        if self._embedder is not None:
            return self._embedder
        async with self._lock:
            if self._embedder is None:  # double-check after waiting on the lock
                t0 = time.perf_counter()
                self._embedder = await asyncio.to_thread(build_embedder, self.cfg)
                log.info(
                    "embedder %s loaded in %.1fs",
                    self._embedder.name,
                    time.perf_counter() - t0,
                )
        return self._embedder

    @contextlib.asynccontextmanager
    async def lease(self):
        """Refcounted access — the model is never unloaded mid-request."""
        embedder = await self._get()
        self._refs += 1
        try:
            yield embedder
        finally:
            self._refs -= 1
            self._last_used = time.monotonic()

    # ---------------------------------------------------------- idle unload

    def start_idle_watchdog(self) -> None:
        if self.cfg.idle_unload_seconds > 0 and self._idle_task is None:
            self._idle_task = asyncio.create_task(self._idle_loop())

    async def stop(self) -> None:
        if self._idle_task:
            self._idle_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._idle_task
            self._idle_task = None

    async def _idle_loop(self) -> None:
        while True:
            await asyncio.sleep(30)
            await self.maybe_unload()

    async def maybe_unload(self) -> None:
        if (
            self._embedder is not None
            and self.cfg.idle_unload_seconds > 0
            and self._refs == 0
            and time.monotonic() - self._last_used > self.cfg.idle_unload_seconds
        ):
            async with self._lock:
                if self._refs == 0 and self._embedder is not None:
                    log.info("unloading idle embedder %s", self._embedder.name)
                    self._embedder = None
