# Relay customer operations cloud

A small TypeScript monorepo: Next.js frontend, Node.js API, shared types, PostgreSQL through Prisma, and Better Auth for email/password and Google OAuth. Organizations, documents, and conversations are protected by membership checks. Conversation replies are fixed demo text; there is no RAG or AI integration.

## Workspaces

- `apps/web`: Next.js App Router, React, TypeScript (`.tsx`).
- `apps/api`: standalone Node.js HTTP API, TypeScript (`.ts`), Prisma, Better Auth.
- `packages/shared`: shared TypeScript API contracts.

npm workspaces manage the repository. No additional monorepo framework is required.

## Local setup

Requires Node.js 22.16+ and Docker (or your own PostgreSQL server).

1. Run `npm ci`.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Set `BETTER_AUTH_SECRET` to a random secret of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
4. Run `npm run db:up` to start local PostgreSQL on port 5434.
5. Run `npm run db:generate` and `npm run db:migrate`.
6. Run `npm run dev` and open http://localhost:3000.

Create an email/password account, create an organization, then add documents and conversations. No seed account or default password is included.

The frontend proxies `/api/*` to the Node API on port 4000. To change this, copy `apps/web/.env.example` to `.env.local` in that directory and change `API_URL`. The API uses `API_PORT`, `API_HOST`, and `DATABASE_URL` from its own `.env`. Set `BETTER_AUTH_URL` to the public frontend origin.

## Google OAuth

Create a Google OAuth web client, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env` and restart the API. Configure this authorized redirect URI in Google Cloud:

`http://localhost:3000/api/auth/callback/google`

For deployment use your HTTPS frontend origin instead. The Google button is disabled until credentials are configured. Live Google sign-in requires those credentials; email/password works independently. Automatic linking of separate accounts is disabled.

## Commands

| Command                                                  | Purpose                                      |
| -------------------------------------------------------- | -------------------------------------------- |
| `npm run dev`                                            | Run both apps with reload                    |
| `npm run build`                                          | Build shared types, API, and frontend        |
| `npm start`                                              | Run both production builds                   |
| `npm run typecheck`                                      | Strict TypeScript checks in every workspace  |
| `npm test`                                               | Database-backed API and authentication tests |
| `npm run format`                                         | Format source files                          |
| `npm run db:generate`                                    | Generate Prisma Client                       |
| `npm run db:migrate`                                     | Apply committed migrations                   |
| `npm run db:migrate:dev -w @relay/api -- --name example` | Create a development migration               |

Tests use the configured database, create uniquely named test accounts and organizations, and clean up their own records. Use a dedicated test database when working with real customer data.

## Basic API

All organization routes require a valid session cookie. POST requests also require an Origin matching `BETTER_AUTH_URL`. Documents are stored as bytes in PostgreSQL without processing; list responses contain metadata only. Uploads accept PDF, TXT, MD, DOCX up to 5 MB.

| Method     | Path                                                   | Body                     |
| ---------- | ------------------------------------------------------ | ------------------------ |
| GET / POST | `/api/organizations`                                   | `{ name, description? }` |
| GET        | `/api/organizations/:orgId`                            | —                        |
| GET / POST | `/api/organizations/:orgId/conversations`              | `{ title? }`             |
| GET        | `/api/organizations/:orgId/conversations/:id`          | —                        |
| GET / POST | `/api/organizations/:orgId/conversations/:id/messages` | `{ text }`               |
| GET / POST | `/api/organizations/:orgId/documents`                  | multipart `file`         |

Better Auth serves signup, login, session, logout, and Google OAuth at `/api/auth/*`. Password hashes and sessions are stored through Prisma. Creating an organization adds the creator as a member. Team invitation and role management are intentionally outside this starter.

## Self-hosting and scope

Run the two Node apps on your own infrastructure with PostgreSQL. Configure `API_URL` before building the frontend, set secrets and database connection in the API environment, run migrations, build, and start. Docker Compose provides a persistent local database volume; its credentials are for local development only.

This is a starter, not a completed production system. Email verification, password-reset email delivery, team invitations, production monitoring, and AI processing are not included. Google OAuth has been wired up but needs your credentials for a live end-to-end check.

The current dependency audit reports four high-severity findings in the Prisma dependency chain (`deepmerge-ts` and `mysql2`, including parent-package reports). This app uses PostgreSQL, not MySQL. Resolve or reassess these upstream dependency findings before production deployment.

Implementation references: [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites), [Better Auth](https://better-auth.com/docs/installation), [Google OAuth configuration](https://better-auth.com/docs/authentication/google), and [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).
