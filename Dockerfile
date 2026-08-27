# syntax=docker/dockerfile:1

# Single-image build: the backend serves both the JSON API and the compiled
# React SPA. No separate frontend image and no database baked in. The backend
# reads from the semantic layer; each request is authenticated with the signed-in
# user's OIDC access_token, so only SEMANTIC_API_URL is configured at deploy time.

# ─── Stage 1: build the frontend ────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: runtime — backend + built SPA in one image ────────────────────
FROM node:22-alpine
WORKDIR /app/backend
# tsx + typescript are devDependencies but are needed to run the app, so keep
# them (install before flipping NODE_ENV so npm doesn't prune dev deps).
COPY backend/package*.json ./
RUN npm install --include=dev
COPY backend/ ./
# The compiled SPA is served from ./public (see STATIC_DIR).
COPY --from=frontend /app/frontend/dist ./public
ENV NODE_ENV=production \
    PORT=4000 \
    STATIC_DIR=/app/backend/public
EXPOSE 4000
CMD ["npm", "start"]
