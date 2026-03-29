# Stage 1: Build
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y build-essential python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
RUN npm run build -w packages/shared && npm run build -w packages/server
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:22-slim
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/
COPY --from=build /app/packages/server/node_modules/ packages/server/node_modules/

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
