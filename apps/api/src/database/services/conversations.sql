CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_email TEXT NOT NULL CHECK (char_length(customer_email) BETWEEN 1 AND 254),
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 255),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array' AND jsonb_array_length(messages) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_organization_idx ON conversations(organization_id);
