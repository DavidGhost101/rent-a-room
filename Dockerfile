# --- Build stage: needs devDependencies (tailwindcss) to compile the CSS ---
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:css

# --- Runtime stage: production dependencies only, plus the compiled output ---
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
# backend/ is the LIVE application code (server.js requires ./backend/src/app and
# ./backend/src/database/connection). Omitting it made the image crash on boot with
# MODULE_NOT_FOUND. The root-level models/routes/middleware are legacy and unused,
# but services/fallbackStore.js is still required by backend/src, so services stays.
COPY backend ./backend
COPY services ./services
COPY --from=build /usr/src/app/public ./public

# Cloud Run sets PORT itself (8080 by default); server.js now honours it.
ENV PORT=8080
EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "server.js"]
