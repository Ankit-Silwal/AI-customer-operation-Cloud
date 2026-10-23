#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=identity_password="$IDENTITY_DB_PASSWORD" \
  --set=organizations_password="$ORGANIZATIONS_DB_PASSWORD" \
  --set=conversations_password="$CONVERSATIONS_DB_PASSWORD" \
  --set=documents_password="$DOCUMENTS_DB_PASSWORD" <<'SQL'
CREATE ROLE identity_app LOGIN PASSWORD :'identity_password';
CREATE ROLE organizations_app LOGIN PASSWORD :'organizations_password';
CREATE ROLE conversations_app LOGIN PASSWORD :'conversations_password';
CREATE ROLE documents_app LOGIN PASSWORD :'documents_password';
CREATE DATABASE identity OWNER identity_app;
CREATE DATABASE organizations OWNER organizations_app;
CREATE DATABASE conversations OWNER conversations_app;
CREATE DATABASE documents OWNER documents_app;
REVOKE CONNECT ON DATABASE identity FROM PUBLIC;
REVOKE CONNECT ON DATABASE organizations FROM PUBLIC;
REVOKE CONNECT ON DATABASE conversations FROM PUBLIC;
REVOKE CONNECT ON DATABASE documents FROM PUBLIC;
SQL
