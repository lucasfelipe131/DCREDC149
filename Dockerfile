FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:railway

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist-railway ./dist-railway
COPY railway/server.mjs ./railway/server.mjs
USER node
CMD ["node", "railway/server.mjs"]
