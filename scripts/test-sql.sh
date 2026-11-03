#!/usr/bin/env bash
# يشغّل اختبارات SQL على Postgres محلي مؤقت (يحتاج postgres و psql).
set -euo pipefail
DB=${TEST_DB:-aaw_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -d $DB"
dropdb --if-exists $DB; createdb $DB
$PSQL -f tests/sql/00_stubs.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f tests/sql/10_tests.sql
