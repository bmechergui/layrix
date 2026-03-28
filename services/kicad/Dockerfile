# ============================================================
# Layrix KiCad Service — Docker headless
# Base : KiCad 8.0 + Python 3.11 + FastAPI + Freerouting
# ============================================================

FROM kicad/kicad:8.0-ubuntu AS base

# Dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    python3-dev \
    openjdk-17-jre-headless \
    curl \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copier les requirements et installer Python deps
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Télécharger Freerouting JAR
RUN mkdir -p /opt/freerouting && \
    curl -L https://github.com/freerouting/freerouting/releases/latest/download/freerouting.jar \
    -o /opt/freerouting/freerouting.jar

# Copier le code source
COPY . .

# Créer le répertoire de travail temporaire
RUN mkdir -p /tmp/kicad-jobs

# Variables d'environnement
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
