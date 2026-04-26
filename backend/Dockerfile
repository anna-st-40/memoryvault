FROM python:3.14-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml poetry.lock ./

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN pip install poetry && \
    poetry config virtualenvs.create false && \
    if [ "${TORCH_INDEX_URL}" != "https://download.pytorch.org/whl/cpu" ]; then \
        poetry source remove pytorch && \
        poetry source add pytorch "${TORCH_INDEX_URL}" --priority explicit; \
    fi && \
    poetry install --no-root --only main --with torch

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
