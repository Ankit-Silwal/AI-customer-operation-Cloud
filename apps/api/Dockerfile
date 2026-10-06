FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/typescript-config ./packages/typescript-config
RUN npm ci --workspace @repo/api --include-workspace-root
COPY apps/api/tsconfig*.json ./apps/api/
COPY apps/api/scripts ./apps/api/scripts
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace @repo/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --omit=dev --workspace @repo/api --ignore-scripts && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
