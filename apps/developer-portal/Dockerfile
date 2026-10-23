FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/developer-portal/package.json ./apps/developer-portal/package.json
COPY packages/service-common/package.json ./packages/service-common/package.json
COPY packages/web-runtime/package.json ./packages/web-runtime/package.json
COPY packages/typescript-config ./packages/typescript-config
RUN npm ci --workspace @repo/developer-portal --include-workspace-root
COPY packages/service-common ./packages/service-common
COPY packages/web-runtime ./packages/web-runtime
COPY apps/developer-portal ./apps/developer-portal
RUN npm run build --workspace @repo/service-common && npm run build --workspace @repo/web-runtime && npm run build --workspace @repo/developer-portal

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/developer-portal/package.json ./apps/developer-portal/package.json
COPY packages/service-common/package.json ./packages/service-common/package.json
COPY packages/web-runtime/package.json ./packages/web-runtime/package.json
RUN npm ci --omit=dev --workspace @repo/developer-portal --ignore-scripts && npm cache clean --force
COPY --from=build /app/packages/service-common/dist ./packages/service-common/dist
COPY --from=build /app/packages/web-runtime/dist ./packages/web-runtime/dist
COPY --from=build /app/apps/developer-portal/dist ./apps/developer-portal/dist
USER node
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=4s --start-period=60s --retries=5 CMD node -e "fetch('http://127.0.0.1:3006/health/ready',{signal:AbortSignal.timeout(2500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/developer-portal/dist/server/server.js"]
