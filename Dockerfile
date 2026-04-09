FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends mediainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY public/ public/

RUN useradd -r -u 1000 cinerr
USER cinerr

CMD ["python", "backend/server.py"]
