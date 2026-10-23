# Conversation server

Independent TypeScript application for `POST /conversation` and `GET /conversation/:id`. This app owns its controllers, services, repositories, routes, Prisma schema/client, SQL initialization, package scripts and Dockerfile. It has no production dependency on `apps/api`.

```sh
docker compose up --build -d conversations
```

For a local process, install from the repository root, build `@repo/service-common`, copy this app's `.env.example` to `.env`, and set its database/core URLs. The root `.env` supplies `JWT_SECRET`.

```sh
npm run build --workspace @repo/service-common
npm run dev --workspace @repo/conversation-server
```

Production starts `apps/conversation-server/dist/server.js` in its own image. Ownership is checked through core over HTTP; the database contains only conversation tables. Shared infrastructure comes from `packages/service-common`. Regression coverage is composed under `apps/api/tests`; `check-microservices.ts` exercises the actual independent HTTP servers.
