-- 2026-07-06: Read-only DB-roll för Hermes systemvakt (Falken).
-- Additiv, ingen schema-ändring. Rollen kan ALDRIG skriva:
--   default_transaction_read_only = on  (Postgres blockerar UPDATE/INSERT/DELETE)
--   statement_timeout = 15s             (kan inte tynga databasen med långa queries)
-- Lösenordet sattes vid körning och bor ENDAST i ~/.hermes/falken.env
-- (FALKEN_DB_RO_URL). Rotera genom att köra ALTER ROLE ... PASSWORD igen.
-- Pooler-login: användarnamnet är hermes_ro.<project-ref> mot Supavisor.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hermes_ro') THEN
    CREATE ROLE hermes_ro LOGIN PASSWORD '<sätts-vid-körning>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;
GRANT CONNECT ON DATABASE postgres TO hermes_ro;
GRANT USAGE ON SCHEMA public TO hermes_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hermes_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hermes_ro;
ALTER ROLE hermes_ro SET default_transaction_read_only = on;
ALTER ROLE hermes_ro SET statement_timeout = '15s';
