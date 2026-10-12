ALTER TABLE users ADD CONSTRAINT users_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 255);
ALTER TABLE users ADD CONSTRAINT users_email_valid CHECK (email = lower(email) AND char_length(email) BETWEEN 1 AND 254);
ALTER TABLE users ADD CONSTRAINT users_password_hash_valid CHECK (char_length(password_hash) >= 32);
ALTER TABLE organizations ADD CONSTRAINT organizations_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 255);
ALTER TABLE conversations ADD CONSTRAINT conversations_subject_valid CHECK (char_length(btrim(subject)) BETWEEN 1 AND 255);
ALTER TABLE conversations ADD CONSTRAINT conversations_email_valid CHECK (char_length(customer_email) BETWEEN 1 AND 254);
ALTER TABLE conversations ADD CONSTRAINT conversations_messages_valid CHECK (jsonb_typeof(messages) = 'array' AND jsonb_array_length(messages) <= 100);
ALTER TABLE documents ADD CONSTRAINT documents_title_valid CHECK (char_length(btrim(title)) BETWEEN 1 AND 255);
ALTER TABLE documents ADD CONSTRAINT documents_content_valid CHECK (char_length(content) <= 200000);

CREATE TABLE document_uploads (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  media_type TEXT NOT NULL CHECK (media_type IN ('text/plain', 'text/markdown', 'application/pdf')),
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 1048576),
  file_data BYTEA NOT NULL CHECK (octet_length(file_data) = byte_length)
);
