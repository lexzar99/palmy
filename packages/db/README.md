# Databaspaketet är inte migrationskälla

`packages/db` innehåller äldre verktyg och en spegel av Prisma-schemat. Dess
migrationshistorik är ofullständig och dess `migration_lock.toml` anger felaktigt
SQLite trots att ViaEats använder PostgreSQL.

Kör därför inte `prisma migrate`, `prisma db push` eller migreringar härifrån mot
produktion. Den aktiva runtime-källan är:

`packages/api/prisma/schema.prisma`

Produktionsproceduren och det tillfälliga migreringsstoppet beskrivs i
`docs/LAUNCH_DATABASE_RUNBOOK.md`.
