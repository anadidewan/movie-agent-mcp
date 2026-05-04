# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and install all dependencies (including devDependencies for tsc)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build

# ---- Production stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from the build stage
COPY --from=builder /app/dist ./dist

# TMDB_API_KEY must be supplied at runtime — never baked into the image
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
