#!/bin/bash
# Boot: hämta preprocessat OSRM-data (tarball från R2) och starta routern.
# OSRM_DATA_URL sätts som env i Railway → pekar på skane-osrm.tar.gz i R2.
set -euo pipefail

DATA_DIR=/data
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/skane.osrm.mldgr" ]; then
  if [ -z "${OSRM_DATA_URL:-}" ]; then
    echo "FATAL: OSRM_DATA_URL saknas och inget data finns i $DATA_DIR" >&2
    exit 1
  fi
  echo "Laddar ner OSRM-data från $OSRM_DATA_URL ..."
  curl -fSL --retry 3 "$OSRM_DATA_URL" | tar -xz -C "$DATA_DIR"
  echo "Klart: $(du -sh "$DATA_DIR" | cut -f1)"
fi

# --max-table-size: dispatchens matris skickar upp till ~80 punkter (kurirer +
# stopp). 200 ger marginal utan att öppna för jättetunga frågor.
exec osrm-routed \
  --algorithm mld \
  --max-table-size 200 \
  --port "${PORT:-5000}" \
  "$DATA_DIR/skane.osrm"
