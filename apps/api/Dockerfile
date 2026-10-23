FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/conversation-server/package.json ./apps/conversation-server/package.json
COPY apps/document-server/package.json ./apps/document-server/package.json
COPY packages/service-common ./packages/service-common
COPY packages/typescript-config ./packages/typescript-config
RUN npm ci --workspace @repo/api --include-workspace-root
COPY apps/api ./apps/api
RUN npm run build --workspace @repo/service-common && npm run build --workspace @repo/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/service-common/package.json ./packages/service-common/package.json
RUN npm ci --omit=dev --workspace @repo/api --ignore-scripts && npm cache clean --force
COPY --from=build /app/packages/service-common/dist ./packages/service-common/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=4s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health/ready',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
