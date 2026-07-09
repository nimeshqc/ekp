"""In-house embeddings (architecture.md §1, §7).

Default backend is bge-small-en-v1.5 as quantized ONNX on CPU (via fastembed,
which wraps ONNX Runtime int8 — ~130 MB resident, no torch). A torch /
sentence-transformers backend is kept behind the same interface for the
"can you use our model?" conversation.
"""

from __future__ import annotations

import threading
from collections import OrderedDict

from ..config import EmbeddingCfg


class Embedder:
    """Interface — swap implementations without touching callers."""

    dim: int = 384
    name: str = ""

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> list[float]:
        raise NotImplementedError


class OnnxEmbedder(Embedder):
    """bge-small via ONNX Runtime int8 on CPU."""

    def __init__(self, cfg: EmbeddingCfg):
        from fastembed import TextEmbedding

        self.name = f"{cfg.model} (onnx-int8)"
        self._batch_size = cfg.batch_size
        self._model = TextEmbedding(model_name=cfg.model, threads=cfg.threads)
        self.dim = len(next(iter(self._model.embed(["warm"]))))

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        # one batched call for the whole document (§4.2 — batched embedding)
        return [v.tolist() for v in self._model.embed(texts, batch_size=self._batch_size)]

    def embed_query(self, text: str) -> list[float]:
        # query_embed applies the bge retrieval instruction prefix
        return next(iter(self._model.query_embed(text))).tolist()


class TorchEmbedder(Embedder):
    """Optional sentence-transformers backend (heavier; not the default)."""

    _QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

    def __init__(self, cfg: EmbeddingCfg):
        from sentence_transformers import SentenceTransformer  # optional dep

        self.name = f"{cfg.model} (torch)"
        self._batch_size = cfg.batch_size
        self._model = SentenceTransformer(cfg.model, device=cfg.device)
        self._model.max_seq_length = cfg.max_seq_length
        self.dim = self._model.get_sentence_embedding_dimension()

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self._model.encode(
            texts, batch_size=self._batch_size, normalize_embeddings=True
        ).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self._model.encode(
            [self._QUERY_PREFIX + text], normalize_embeddings=True
        )[0].tolist()


def build_embedder(cfg: EmbeddingCfg) -> Embedder:
    if cfg.backend == "torch":
        return TorchEmbedder(cfg)
    return OnnxEmbedder(cfg)


class QueryEmbeddingCache:
    """Small thread-safe LRU so repeated questions skip re-embedding (§4.2)."""

    def __init__(self, maxsize: int = 128):
        self._data: OrderedDict[str, list[float]] = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()

    def get(self, key: str) -> list[float] | None:
        with self._lock:
            vec = self._data.get(key)
            if vec is not None:
                self._data.move_to_end(key)
            return vec

    def put(self, key: str, vec: list[float]) -> None:
        with self._lock:
            self._data[key] = vec
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)
