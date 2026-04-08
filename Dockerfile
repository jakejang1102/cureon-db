# Build frontend
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# API + static
FROM node:20-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install
COPY server/ ./
COPY --from=client-build /app/client/dist ./client/dist
RUN npx prisma generate

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/prod.db
ENV PORT=4000
EXPOSE 4000

VOLUME ["/app/data"]

CMD sh -c "npx prisma db push && node src/index.js"
