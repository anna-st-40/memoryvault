FROM python:3.13-slim

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /shared/
RUN pip install /shared/

COPY worker/pyproject.toml ./
RUN pip install --extra-index-url ${TORCH_INDEX_URL} whisperx sqlalchemy numpy

COPY worker/ .

CMD ["python", "-m", "app.main"]
