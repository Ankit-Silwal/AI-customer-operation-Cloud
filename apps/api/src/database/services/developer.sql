CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  key_hash TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  prefix TEXT NOT NULL CHECK (char_length(prefix) BETWEEN 10 AND 32),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 4 AND scopes <@ ARRAY['chat:write','documents:read','documents:write','otp:write']::TEXT[]),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS developer_api_keys_org_idx ON developer_api_keys(organization_id);
