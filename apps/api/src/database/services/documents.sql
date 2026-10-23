CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
  content TEXT NOT NULL CHECK (char_length(content) <= 200000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_organization_idx ON documents(organization_id);
CREATE TABLE IF NOT EXISTS document_uploads (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  media_type TEXT NOT NULL CHECK (media_type IN ('text/plain', 'text/markdown', 'application/pdf')),
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 1048576),
  file_data BYTEA NOT NULL CHECK (octet_length(file_data) = byte_length)
);
