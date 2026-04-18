# Dockerfile for Naruto AI backend (Node + TypeScript)
# Multi-stage build: compile TS then run production image

FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Install build deps
COPY package*.json ./
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
# Install only production dependencies (fallback to install if lockfile missing)
RUN npm install --only=production || true

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
