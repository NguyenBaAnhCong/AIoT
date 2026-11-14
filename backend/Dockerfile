FROM node:20-alpine
RUN apk add --no-cache font-dejavu \
    && mkdir -p /usr/share/fonts/truetype/dejavu \
    && cp "$(find /usr/share/fonts -name DejaVuSans.ttf -print -quit)" /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
WORKDIR /app/tv5
COPY tv5/package*.json ./
RUN npm ci --omit=dev
COPY tv5/*.mjs ./

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
EXPOSE 4000
CMD ["node", "src/server.js"]
