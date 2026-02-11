# Arc Raiders Twitch Bot — runs server + bot; bot connects only when TWITCH_CHANNEL is live (if TWITCH_CLIENT_ID/SECRET set)

# Stage 1: build (need devDependencies for tsc; server tsconfig extends ../tsconfig.json)
FROM node:20-alpine AS builder
WORKDIR /app
COPY tsconfig.json ./
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
RUN cd server && npm run build

# Stage 2: production (runtime deps only)
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY --from=builder /app/server/dist ./server/dist

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
