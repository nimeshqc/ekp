"""Loads and validates config.yaml (non-secret) + environment variables (secrets).

architecture.md §9: config.yaml is versioned and mounted into the container;
credentials only ever come from the environment.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel


class EmbeddingCfg(BaseModel):
    model: str = "BAAI/bge-small-en-v1.5"
    backend: Literal["onnx-int8", "torch"] = "onnx-int8"
    device: str = "cpu"
    threads: int = 2
    batch_size: int = 32
    max_seq_length: int = 512
    warm: Literal["startup", "on_link_open", "lazy"] = "startup"
    idle_unload_seconds: int = 0


class LLMCfg(BaseModel):
    provider: str = "gemini"
    model: str = "gemini-2.0-flash"
    temperature: float = 0.2
    max_output_tokens: int = 1024
    stream: bool = True


class ChunkingCfg(BaseModel):
    splitter: Literal["recursive", "markdown", "sentence"] = "recursive"
    chunk_size: int = 800
    chunk_overlap: int = 120


class RetrievalCfg(BaseModel):
    index: str = "hnsw"
    top_k: int = 5
    score_threshold: float = 0.30


class FollowUpsCfg(BaseModel):
    enabled: bool = True
    count: int = 3


class LimitsCfg(BaseModel):
    default_max_ingestions: int = 5
    default_max_queries: int = 25
    max_file_mb: int = 25
    max_files: int = 5


class Secrets(BaseModel):
    gemini_api_key: str = ""
    admin_username: str = ""
    admin_password: str = ""
    jwt_secret: str = ""
    database_url: str = ""


class Settings(BaseModel):
    embedding: EmbeddingCfg = EmbeddingCfg()
    llm: LLMCfg = LLMCfg()
    chunking: ChunkingCfg = ChunkingCfg()
    retrieval: RetrievalCfg = RetrievalCfg()
    follow_ups: FollowUpsCfg = FollowUpsCfg()
    limits: LimitsCfg = LimitsCfg()
    secrets: Secrets = Secrets()


def _find_config_file() -> Path | None:
    env = os.environ.get("EKP_CONFIG")
    if env:
        return Path(env)
    # walk up from this file so `uvicorn app.main:app` works from backend/
    for base in (Path.cwd(), *Path(__file__).resolve().parents):
        candidate = base / "config.yaml"
        if candidate.is_file():
            return candidate
    return None


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    path = _find_config_file()
    data: dict = {}
    if path and path.is_file():
        data = yaml.safe_load(path.read_text()) or {}

    secrets = Secrets(
        gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
        admin_username=os.environ.get("ADMIN_USERNAME", ""),
        admin_password=os.environ.get("ADMIN_PASSWORD", ""),
        jwt_secret=os.environ.get("JWT_SECRET", ""),
        database_url=os.environ.get(
            "DATABASE_URL", "postgresql://ekp:ekp@localhost:5432/ekp"
        ),
    )
    return Settings(**data, secrets=secrets)
