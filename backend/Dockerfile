FROM python:3.11-slim

WORKDIR /srv/backend

COPY pyproject.toml ./
COPY app ./app
COPY default_corpus ./default_corpus
RUN pip install --no-cache-dir .

# pin BLAS/ONNX threading to the 2 vCPU budget (architecture.md §10)
ENV OMP_NUM_THREADS=2 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# 1 worker: the embedder loads once; concurrency via async I/O (§10)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
