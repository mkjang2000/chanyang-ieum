# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    IMAGE_STORAGE_DIR=/data/images \
    TZ=Asia/Seoul

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-kor \
      tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/scripts /app/database /app/src/server /data/images \
    && chown -R node:node /data/images

WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database/schema.sql ./database/schema.sql
COPY --from=builder /app/scripts/start.mjs /app/scripts/migrate.mjs ./scripts/
COPY --from=builder /app/src/server/config.js ./src/server/config.js
COPY --from=builder /app/src/server/httpSecurity.js ./src/server/httpSecurity.js
COPY --chown=node:node --chmod=755 scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh

USER node
EXPOSE 3000
VOLUME ["/data/images"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["./scripts/container-entrypoint.sh"]
