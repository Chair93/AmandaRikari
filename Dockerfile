# Builds the React frontend and the Express backend, then serves both
# from a single Node process (the backend serves the frontend's static
# build and proxies nothing — same origin, so no CORS/cookie headaches).

FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY app/web/package*.json ./
RUN npm ci
COPY app/web/ ./
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY app/server/package*.json ./
RUN npm ci
COPY app/server/ ./
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY app/server/package*.json ./
RUN npm ci
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=web-build /app/web/dist ./dist/public

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
