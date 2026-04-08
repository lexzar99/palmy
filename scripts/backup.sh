#!/bin/bash
# ============================================================
# MatGo Backup Script
# Skapar en komplett backup av kod och databas
# Kör: ./scripts/backup.sh
# ============================================================

set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$(git rev-parse --show-toplevel)/tmp/backups"
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

echo ""
echo "🔒 MatGo Backup — $TIMESTAMP"
echo "=================================="

# ── 1. Git commit + tag ──────────────────────────────────────
echo ""
echo "📦 Steg 1: Git commit och tag..."

cd "$PROJECT_ROOT"

# Stage alla ändringar (ny och modifierad)
git add -A

# Commit om det finns osparade ändringar
if ! git diff --cached --quiet; then
  git commit -m "chore: auto-backup $TIMESTAMP" --no-verify || true
  echo "  ✅ Commit skapad"
else
  echo "  ℹ️  Inga ändringar att committa"
fi

# Skapa en tag för backupen
TAG_NAME="backup/$TIMESTAMP"
git tag "$TAG_NAME" || true
echo "  ✅ Tag skapad: $TAG_NAME"

# Pusha om remote finns
if git remote get-url origin &>/dev/null; then
  echo "  📤 Pushar till origin..."
  git push origin HEAD --tags 2>&1 | tail -3 || echo "  ⚠️  Push misslyckades (fortsätter ändå)"
fi

# ── 2. Databas-backup (Supabase PostgreSQL) ──────────────────
echo ""
echo "🗄️  Steg 2: Databas-backup..."

mkdir -p "$BACKUP_DIR"

# Hitta DATABASE_URL
DB_URL=""
if [ -f "$PROJECT_ROOT/packages/api/.env" ]; then
  DB_URL=$(grep "^DATABASE_URL=" "$PROJECT_ROOT/packages/api/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi
if [ -z "$DB_URL" ] && [ -f "$PROJECT_ROOT/.env" ]; then
  DB_URL=$(grep "^DATABASE_URL=" "$PROJECT_ROOT/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

if [ -n "$DB_URL" ]; then
  DB_FILE="$BACKUP_DIR/db_backup_${TIMESTAMP}.sql"
  echo "  Exporterar PostgreSQL-databas..."
  
  if command -v pg_dump &>/dev/null; then
    pg_dump "$DB_URL" \
      --no-owner \
      --no-privileges \
      --clean \
      --if-exists \
      --format=plain \
      -f "$DB_FILE" 2>&1 && echo "  ✅ Databas exporterad → $DB_FILE" || echo "  ⚠️  pg_dump misslyckades"
    
    # Komprimera
    gzip -f "$DB_FILE" && echo "  ✅ Komprimerad → ${DB_FILE}.gz"
  else
    echo "  ⚠️  pg_dump hittades inte. Installera: brew install libpq"
    echo "  ℹ️  DATABASE_URL: ${DB_URL:0:40}..."
  fi
else
  echo "  ⚠️  DATABASE_URL hittades inte i .env"
fi

# Lokal SQLite (dev.db) om den finns
if [ -f "$PROJECT_ROOT/packages/api/prisma/dev.db" ]; then
  LOCAL_DB_FILE="$BACKUP_DIR/dev_db_${TIMESTAMP}.sqlite"
  cp "$PROJECT_ROOT/packages/api/prisma/dev.db" "$LOCAL_DB_FILE"
  echo "  ✅ Lokal SQLite kopierad → $LOCAL_DB_FILE"
fi

# ── 3. Städa gamla backups ────────────────────────────────────
echo ""
echo "🧹 Steg 3: Rensa gamla backups (behåller 10 senaste)..."
ls -t "$BACKUP_DIR"/db_backup_*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
ls -t "$BACKUP_DIR"/dev_db_*.sqlite 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
echo "  ✅ Klart"

# ── Sammanfattning ────────────────────────────────────────────
echo ""
echo "=================================="
echo "✅ Backup slutförd: $TIMESTAMP"
echo ""
echo "  📁 Backup-filer: $BACKUP_DIR"
echo "  🏷️  Git-tag: $TAG_NAME"
echo ""
echo "Kör 'git tag | grep backup' för att se alla backup-taggar."
echo ""
