# OSRM-ruttmotor för ViaEats dispatch (Skåne-kartan).
#
# Tung preprocessning (osrm-extract/partition/customize) körs LOKALT
# (tools/osrm/build-data.sh) och resultatet laddas upp till R2. Den här
# containern laddar bara ner färdigt data vid boot och serverar /table-frågor.
# Ny karta = kör build-data.sh igen + redeploy (ingen kodändring).
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY start.sh /start.sh
RUN chmod +x /start.sh

# Railway sätter PORT; osrm-routed binder den i start.sh.
ENTRYPOINT []
CMD ["/start.sh"]
