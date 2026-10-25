#!/bin/sh
# Read replica bootstrap: clone the primary once with pg_basebackup, then run as a hot standby.
# The clone writes standby.signal plus primary_conninfo/primary_slot_name (-R).
set -eu
: "${PGDATA:=/var/lib/postgresql/data}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  until pg_isready -h "$PRIMARY_HOST" -p 5432 -q; do
    echo "waiting for primary $PRIMARY_HOST"; sleep 2
  done
  # A failed or interrupted clone leaves a partial directory; start every attempt clean.
  find "$PGDATA" -mindepth 1 -delete
  if ! PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup -h "$PRIMARY_HOST" -U replicator \
      -D "$PGDATA" -X stream -S "$REPLICATION_SLOT" -R --checkpoint=fast; then
    find "$PGDATA" -mindepth 1 -delete
    echo "base backup failed; container will restart and retry" >&2
    exit 1
  fi
  chmod 700 "$PGDATA"
fi

exec docker-entrypoint.sh postgres \
  -c hba_file=/etc/postgresql/pg_hba.conf \
  -c max_connections="${POSTGRES_MAX_CONNECTIONS:-200}" \
  -c hot_standby=on \
  -c hot_standby_feedback=on \
  -c max_standby_streaming_delay=5s
