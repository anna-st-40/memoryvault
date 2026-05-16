FROM python:3.13-slim

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /shared/
RUN pip install /shared/

# Install CPU-only torch before poetry resolves sentence-transformers,
# otherwise pip defaults to the CUDA build (~15GB).
RUN pip install torch --extra-index-url ${TORCH_INDEX_URL}

COPY backend/pyproject.toml backend/poetry.lock ./
RUN pip install poetry && \
    poetry config virtualenvs.create false && \
    poetry install --no-root --only main

COPY backend/ .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
