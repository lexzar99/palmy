#!/bin/bash
# Preprocessa Skåne-kartan för OSRM (körs LOKALT, kräver Docker + osmium).
#
#   1. Klipper Skåne (bbox) ur sweden-latest.osm.pbf
#   2. osrm-extract (bilprofil) + osrm-partition + osrm-customize (MLD)
#   3. Paketerar till skane-osrm.tar.gz
#
# Användning: ./build-data.sh /path/till/sweden-latest.osm.pbf /path/ut
# Ladda sedan upp tarballen till R2 (tools/osrm/upload-data.mjs) och
# redeploya osrm-tjänsten i Railway.
set -euo pipefail

SWEDEN_PBF="${1:?ange sökväg till sweden-latest.osm.pbf}"
OUT_DIR="${2:-$(dirname "$SWEDEN_PBF")}"
OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v5.27.1

# Skåne + marginal (Öresundsbron mot Köpenhamn ingår för bilvägar västerut).
BBOX="12.3,55.2,14.7,56.7"

cd "$OUT_DIR"
echo "==> Klipper Skåne ($BBOX) ur $(basename "$SWEDEN_PBF")..."
osmium extract -b "$BBOX" "$SWEDEN_PBF" -o skane.osm.pbf --overwrite
ls -lh skane.osm.pbf

echo "==> OSRM extract (bilprofil)..."
docker run --rm -v "$OUT_DIR:/data" "$OSRM_IMAGE" osrm-extract -p /opt/car.lua /data/skane.osm.pbf
echo "==> OSRM partition..."
docker run --rm -v "$OUT_DIR:/data" "$OSRM_IMAGE" osrm-partition /data/skane.osrm
echo "==> OSRM customize..."
docker run --rm -v "$OUT_DIR:/data" "$OSRM_IMAGE" osrm-customize /data/skane.osrm

echo "==> Paketerar..."
tar -czf skane-osrm.tar.gz skane.osrm*
ls -lh skane-osrm.tar.gz
echo "Klar. Ladda upp med: node tools/osrm/upload-data.mjs $OUT_DIR/skane-osrm.tar.gz"
