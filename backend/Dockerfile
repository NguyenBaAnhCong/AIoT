FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
# Áp migration mới (nếu có) rồi chạy server
CMD ["sh", "-c", "node src/migrate.js && node src/server.js"]
