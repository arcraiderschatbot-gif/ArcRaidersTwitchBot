# Arc Raiders Twitch Bot — runs server + bot; bot connects only when TWITCH_CHANNEL is live (if TWITCH_CLIENT_ID/SECRET set)
FROM node:20-alpine

WORKDIR /app

# Server (bot + EBS)
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
RUN cd server && npm run build

# Extension build if needed (optional; uncomment if you serve extension from same image)
# COPY extension/ ./extension/
# RUN cd extension && npm ci && npm run build

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/server
CMD ["node", "dist/index.js"]
