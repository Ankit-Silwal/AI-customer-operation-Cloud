# Hearth and the Oak & Ember demo

This pass completes the product workflows and the two web interfaces. It does not add load balancers, database replicas, extra database servers or horizontal scaling.

## Open the project

Run `docker compose up --build -d --wait --wait-timeout 600` from the repository root with the existing `.env` containing `JWT_SECRET`.

- **Hearth workspace:** http://localhost:3030
- **Oak & Ember demo company:** http://localhost:3035
- **Existing API gateway:** http://localhost:3001

Ports 3030/3035 avoid another local project already listening on port 3000. Set `WEB_PORT`/`DEMO_PORT` and matching `WEB_ORIGIN`/`DEMO_ORIGIN` to use different addresses. For HTTPS set the origins to the actual public URLs; secure cookies are enabled automatically for HTTPS origins. `WEB_COOKIE_SECURE=true` can explicitly require secure cookies.

The workspace supports account registration/sign-in/sign-out, multiple workspaces, paginated and searchable conversations, safe message replies, text/Markdown/PDF uploads, source inspection/download, indexing, and a source-backed AI playground. Counts come from the owning services. Empty states stay empty until records exist. Written answers are disabled until the Gemini key is configured; passage search works without it. Documents are immutable: upload a new version when a policy changes, then index it.

The UI uses self-hosted fonts, cream surfaces, terracotta accents, olive status colors and serif headings. It supports narrow screens, keyboard navigation, native modal focus trapping, reduced motion, request errors and retry guidance. Browser credentials live in HTTP-only, SameSite=Strict cookies; bearer tokens are never placed in browser storage or returned by the web auth endpoints. Workspace IDs and saved demo products are the only local-storage values.

## Customer-facing demonstration

Oak & Ember is explicitly fictional. Its collection has illustrative products/prices, product details, saved pieces, care FAQs, and a working support assistant. It accepts no purchases, payments, or real orders.

The company server provisions a separate demo owner, workspace and customer care document, then indexes that document through the real RAG service. Existing matching demo records are reused on restart. The website serves while preparation runs; chat remains unavailable until preparation succeeds. Preparation retries at one-minute intervals when a dependency is unavailable. Default demo credentials are derived privately from the shared secret. Set `DEMO_OWNER_EMAIL` and a strong `DEMO_OWNER_PASSWORD` to manage this fictional company through Hearth yourself. Rotating the signing secret changes the default derived password; use an explicit demo password when preserving the demo account across rotations.

Public chat accepts only a question. The browser cannot supply an organization, owner token or conversation ID. A separately scoped, signed HTTP-only visitor cookie binds it to its own conversation; the company server keeps its owner credentials private. Replies and customer questions are persisted in the dedicated conversation service. Chat uses company-scoped indexed sources. Without a Gemini key, it shows direct policy passages and labels that mode clearly; it does not pretend that retrieved text is generated advice. It cannot look up real orders or issue refunds.

Public chat has shared global and per-IP limits, while downstream owner and RAG limits still apply. Conversations are capped at 100 messages. Resetting chat clears that browser's association; the conversation remains in the company owner's inbox. Requests contain customer text, so production operators should define their own retention and privacy policy before accepting real customers.

The dashboard and demo servers verify an exact configured Origin for writes. They sign the socket client address with a frontend-specific HMAC purpose. The gateway's `RATE_LIMIT_TRUST_FRONTEND=true` accepts only those valid, short-lived signatures, and re-signs the address for downstream services. Caller-supplied forwarding headers remain untrusted. No unrestricted proxy trust is enabled. This preserves IP rate limits when requests pass through the browser-facing servers.

## Added API workflows

All gateway endpoints below use the existing Bearer JWT and its user quota.

| Method / path                           | Behavior                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /me`                               | Signed-in user without password fields; `401` if the account no longer exists |
| `GET /organizations`                    | Organizations belonging to the verified user                                  |
| `GET /documents?organizationId=UUID`    | Owned workspace document metadata, excluding document content and file bytes  |
| `GET /conversation?organizationId=UUID` | Owned workspace conversations                                                 |
| `POST /conversation/:id/messages`       | Append 1–10 validated messages using `expectedCount` as the concurrency token |

Lists accept `page` (1–10000), `pageSize` (1–100, default 20), and `search` (up to 100 characters). Responses are `{ items, total, page, pageSize }` with stable newest-first ordering. Invalid parameters return `400`; unowned organizations return `404`. Message appends reject an unowned conversation with `404`, stale counts with `409`, and invalid/overlong histories with `400`. A single conditional SQL update through Prisma prevents two simultaneous replies from overwriting each other. A client that receives `409` reloads the conversation before retrying.

The web server exposes only an allowlisted `/api` bridge and same-origin auth/session endpoints; it is not an arbitrary HTTP proxy. API responses preserve rate-limit and retry headers. Full contracts and verification results live alongside the implementation. Existing root `.env` values are not rewritten.

## Development and validation

Keep infrastructure/domain services running in Docker, then run the frontends independently:

```sh
npm install
npm run build --workspace @repo/service-common
npm run build --workspace @repo/web-runtime
npm run dev --workspace @repo/web
npm run dev --workspace @repo/company-demo
```

The servers read root `.env` and optional app `.env.local`; default host connections use the gateway at localhost:3001 and authenticated Redis at localhost:6379. For local frontend processes publish Redis on loopback with `docker compose -f compose.yaml -f compose.dev.yaml up -d --wait redis` and set `RATE_LIMIT_REDIS_URL` to the matching authenticated URL. The ordinary Docker stack keeps Redis internal.

Run `npm test`, `npm run build`, `npm run check-types`, and `npm run lint` serially. Install Chromium with `npx playwright install chromium`, then run `npm run test:web` against the running stack. Browser workflow/security/accessibility checks are maintained separately from the database suite. Results and the repeatable dependency failure simulation are in [web verification](web-validation.md). These checks establish functional correctness for the implemented flows, not production load capacity. Real Gemini generation still requires the user's credentials and permitted model access.

## Visual asset

`apps/company-demo/public/oak-and-ember-hero.png` was generated using the built-in image-generation tool. Prompt: “Photorealistic editorial interior product photograph for a fictional premium homewares shop. No text or logos. Wide landscape composition, warm plaster room, terracotta and beige handmade ceramic vases on a walnut sideboard, an olive branch, folded linen, afternoon sunlight and soft geometric shadows. Cream, rust, olive and walnut palette; tactile craftsmanship, high-end interiors magazine, subtle film grain.” Product card illustrations and interface marks are original SVG/CSS. No real customer logos, endorsements or testimonials are claimed.
