# Document server

Independent TypeScript application for document creation, metadata, Text/Markdown/PDF uploads and byte-preserving downloads. This app owns its controllers, services, upload processing, repositories, routes, Prisma schema/client, SQL initialization, package scripts and Dockerfile. It has no production dependency on `apps/api`.

```sh
docker compose up --build -d documents
```

For a local process, install from the repository root, build `@repo/service-common`, copy this app's `.env.example` to `.env`, and set its database/core URLs. The root `.env` supplies `JWT_SECRET`.

```sh
npm run build --workspace @repo/service-common
npm run dev --workspace @repo/document-server
```

Production starts `apps/document-server/dist/server.js` in its own image. Ownership is checked through core over HTTP, and metadata/file bytes are written in a local Prisma transaction. Embedding and PDF text extraction for retrieval stay in the separate `apps/rag` application. Shared infrastructure comes from `packages/service-common`.
