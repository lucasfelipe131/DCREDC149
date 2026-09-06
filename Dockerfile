FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:railway && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-por tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist-railway ./dist-railway
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY railway/server.mjs ./railway/server.mjs
COPY server ./server
USER node
CMD ["node", "railway/server.mjs"]
