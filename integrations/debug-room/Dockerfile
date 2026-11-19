FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm test && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV PORT=4174 ROOM_DATA_DIR=/app/data
USER node
EXPOSE 4174
CMD ["node","server.mjs"]
