# Developer API

The API is free for now. Create a workspace at http://localhost:3030, open Settings, and create a scoped API key. No checkout is required. The public documentation and sandbox run at http://localhost:3040; sandbox requests need no API key and use fictional knowledge only.

External requests use `Authorization: Bearer <API_KEY>` and base URL `http://localhost:3001/v1`. Keys belong to one workspace, expire after 90 days, are displayed once, and can be revoked in Settings. At most five active keys are allowed per workspace. Store keys on your server. The service stores SHA-256 hashes, never recoverable raw keys. Password changes invalidate browser sessions; API keys are revoked independently.

| Method | Path | Scope | Behavior |
| --- | --- | --- | --- |
| POST | /chat | chat:write | `{question, history?, topK?}`; one answer with sources and mode. History is at most five complete user/assistant turns, 4,000 characters per message. |
| GET, POST | /documents | documents:read / documents:write | List with page/pageSize, or create `{title, content}` in the key's workspace. |
| POST | /documents/upload | documents:write | Multipart `title` and `file`; PDF, text or Markdown, maximum 1 MiB. |
| GET, DELETE | /documents/{id} | documents:read / documents:write | Read or delete a source, including indexed vectors. |
| GET | /documents/{id}/download | documents:read | Download the uploaded file. |
| POST | /documents/{id}/index | documents:write | Index using local BAAI/bge-small-en-v1.5 into Qdrant. |
| GET, POST | /conversations | chat:write | List or create `{customerEmail, subject, messages}`. |
| GET | /conversations/{id} | chat:write | Read a saved conversation. |
| POST | /conversations/{id}/messages | chat:write | Append `{expectedCount, messages}`; stale counts return 409. |
| POST | /otp/challenges | otp:write | `{email, purpose}`; email a six-digit code using Nodemailer. Returns challengeId and expiry, never the code. |
| POST | /otp/verify | otp:write | `{challengeId, email, purpose, code}`; single-use verification. |

Workspace identity is derived from the key. Do not send organizationId. Resources from other workspaces return 404. OTP purpose is a 1–64 character application identifier (letters, digits, underscore, dash). Codes expire in five minutes, allow five failed attempts, and a new challenge replaces the previous challenge for that recipient and purpose in the same workspace. Successful verification consumes the code; your server must then perform the authorized action. Delivery and verification are separate operations. SMTP delivery is required for real OTPs; missing configuration returns 503.

Errors are JSON `{error, requestId}`. Handle 400 invalid input/OTP, 401 invalid/expired/revoked key, 403 missing scope, 404 inaccessible resource, 409 concurrent update, 413 oversized body, 429 quota, and 503 unavailable dependency. Respect Retry-After. Retry reads after backoff; writes are not automatically retried because they can duplicate side effects. Request limits apply globally, per IP, per key, per workspace, and separately to chat and OTP delivery. Free does not mean unlimited or a promise of free provider infrastructure.

Account recovery (first-party website): POST `/auth/password/forgot` with email; POST `/auth/password/reset` with email, challengeId, code and password. Forgot-password acknowledgements do not disclose whether an account exists. Signed-in users use POST `/auth/password/change/request` then `/auth/password/change/confirm` with challengeId, code and password. The confirm endpoint returns a replacement session. Old sessions are invalid immediately after the database update.

## Configuration

Set SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM in the root .env. SMTP_SECURE is true for implicit TLS (465); otherwise STARTTLS is required by default (SMTP_REQUIRE_TLS=true). Supply real SMTP settings before expecting delivery. Public sandbox OTPs display a demo code and do not send mail.

Put your integration key in `apps/company-demo/.env` as HEARTH_API_KEY. HEARTH_API_BASE_URL defaults to http://localhost:3001/v1 for local development; Docker uses the internal gateway URL. Restart the company-demo server after changing the file. Never prefix secrets with VITE_.
