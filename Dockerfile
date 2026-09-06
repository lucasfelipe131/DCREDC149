FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:railway

FROM node:22-bookworm-slim AS runtime-deps
WORKDIR /runtime
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-por tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist-railway ./dist-railway
COPY --from=runtime-deps /runtime/node_modules ./server/node_modules
COPY package.json ./
COPY railway/server.mjs ./railway/server.mjs
COPY server ./server
USER node
CMD ["node", "railway/server.mjs"]
