#!/bin/sh
# One-shot job: idempotently create/rotate the streaming-replication role and one physical slot
# per replica on the primary. Runs on every `up`, so it also upgrades existing volumes.
set -eu
export PGPASSWORD="$POSTGRES_PASSWORD"
psql -v ON_ERROR_STOP=1 -h "$PRIMARY_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --set=replication_password="$REPLICATION_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE replicator' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') \gexec
ALTER ROLE replicator WITH REPLICATION LOGIN PASSWORD :'replication_password';
SQL
for slot in $REPLICATION_SLOTS; do
  psql -v ON_ERROR_STOP=1 -h "$PRIMARY_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT pg_create_physical_replication_slot('$slot') WHERE NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = '$slot')" >/dev/null
done
echo "replication ready: $REPLICATION_SLOTS"
