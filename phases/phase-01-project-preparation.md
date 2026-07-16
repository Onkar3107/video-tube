# Phase 1 — Project Preparation

> **Status**: Not started  
> **Estimated Time**: 2–3 hours  
> **Prerequisite**: None — this is the first phase  
> **Strict Scope**: Configuration, folder structure, Docker setup only. No source code changes. No TypeScript. No business logic changes.

---

## Objective

Clean the repository, establish the final target folder structure, create all configuration files, write Docker support, and document the project. Every subsequent phase builds on this foundation.

---

## Step-by-Step Tasks

### Step 1.1 — Update `.gitignore`

Replace the existing `.gitignore` with:

```gitignore
# Dependencies
node_modules/

# Build output
dist/

# Test coverage
coverage/

# Environment files
.env
.env.*
!.env.example

# Prisma
prisma/migrations/dev.db

# Logs
*.log
logs/

# Upload temp directory
public/temp/*
!public/temp/.gitkeep

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Docker volumes
postgres_data/
```

---

### Step 1.2 — Create `.env.example`

Create `.env.example` at the project root:

```bash
# ─── Server ──────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=8000
CORS_ORIGIN=http://localhost:3000

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://videotube:password@localhost:5432/videotube

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── JWT ─────────────────────────────────────────────────────────────────────
# Minimum 32 characters for security
ACCESS_TOKEN_SECRET=your-super-secret-access-token-key-minimum-32-chars
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-minimum-32-chars
REFRESH_TOKEN_EXPIRY=7d

# ─── Cloudinary ──────────────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# ─── Logging ─────────────────────────────────────────────────────────────────
# Options: trace | debug | info | warn | error | fatal
LOG_LEVEL=info
```

---

### Step 1.3 — Update `README.md`

Replace the existing `README.md` with a production-quality README:

```markdown
# VideoTube Backend

A production-ready YouTube-clone backend demonstrating modern Node.js backend engineering practices.

## Tech Stack

| Concern        | Technology              |
|----------------|-------------------------|
| Language       | TypeScript (strict)     |
| Framework      | Express.js 4            |
| Database       | PostgreSQL 16           |
| ORM            | Prisma ORM              |
| Cache          | Redis + ioredis         |
| Queue          | BullMQ                  |
| Realtime       | Native WebSockets (ws)  |
| Auth           | JWT (access + refresh)  |
| Storage        | Cloudinary              |
| Logging        | Pino                    |
| Testing        | Vitest + Supertest      |
| Container      | Docker + Docker Compose |
| CI             | GitHub Actions          |

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- A Cloudinary account (free tier is sufficient)

## Local Development Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd video-tube-main
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start infrastructure

```bash
docker-compose up postgres redis -d
```

### 4. Run database migrations

```bash
npx prisma migrate dev
npx prisma db seed
```

### 5. Start the development server

```bash
npm run dev
```

The API is available at `http://localhost:8000`.

### 6. Start the worker process (separate terminal)

```bash
npm run worker
```

## Available Scripts

| Script                | Description                          |
|-----------------------|--------------------------------------|
| `npm run dev`         | Start dev server with hot reload     |
| `npm run worker`      | Start BullMQ worker process          |
| `npm run build`       | Compile TypeScript to dist/          |
| `npm run start`       | Run compiled production build        |
| `npm run type-check`  | TypeScript type checking (no emit)   |
| `npm run lint`        | ESLint check                         |
| `npm run lint:fix`    | ESLint auto-fix                      |
| `npm run format`      | Prettier formatting                  |
| `npm run test`        | Run all tests                        |
| `npm run test:unit`   | Run unit tests only                  |
| `npm run test:integration` | Run integration tests         |
| `npm run test:coverage` | Run tests with coverage report     |

## Docker

### Development (all services)

```bash
docker-compose up
```

### Production

```bash
docker-compose -f docker-compose.yml up --build
```

## API Documentation

Swagger UI is available at: `http://localhost:8000/docs`

## Queue Dashboard

Bull Board UI is available at: `http://localhost:8000/admin/queues`

## API Overview

Base URL: `/api/v1`

| Module        | Routes                                      |
|---------------|---------------------------------------------|
| Health Check  | `GET /health-check`                         |
| Users         | Register, Login, Logout, Profile, etc.      |
| Videos        | CRUD, Publish/Unpublish, Paginated list      |
| Comments      | CRUD per video, Paginated                   |
| Likes         | Toggle video/comment/tweet likes            |
| Subscriptions | Toggle, Subscriber list, Channel list       |
| Tweets        | CRUD                                        |
| Playlists     | CRUD, Add/Remove video                      |
| Dashboard     | Channel stats, Channel videos               |
| Notifications | Inbox, Mark read                            |

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed diagrams covering:
- Request Flow
- Authentication Flow
- Video Upload Flow
- Worker Flow
- WebSocket Flow
- Notification Flow
```

---

### Step 1.4 — Create Target Folder Structure

Run these commands to create all directories and placeholder files:

```bash
# Config
mkdir -p src/config

# Types
mkdir -p src/types

# Modules
mkdir -p src/modules/user
mkdir -p src/modules/video
mkdir -p src/modules/comment
mkdir -p src/modules/like
mkdir -p src/modules/subscription
mkdir -p src/modules/tweet
mkdir -p src/modules/playlist
mkdir -p src/modules/dashboard
mkdir -p src/modules/notification

# Middlewares
mkdir -p src/middlewares

# Utils
mkdir -p src/utils

# Queues
mkdir -p src/queues

# Workers
mkdir -p src/workers

# WebSocket
mkdir -p src/websocket/events
mkdir -p src/websocket/middleware

# Prisma
mkdir -p prisma/migrations

# Tests
mkdir -p tests/unit/services
mkdir -p tests/unit/repositories
mkdir -p tests/unit/middlewares
mkdir -p tests/unit/utils
mkdir -p tests/unit/validators
mkdir -p tests/integration
mkdir -p tests/helpers

# Docs
mkdir -p docs

# GitHub Actions
mkdir -p .github/workflows

# Upload temp directory
mkdir -p public/temp
touch public/temp/.gitkeep
```

---

### Step 1.5 — Create `Dockerfile`

Create `Dockerfile` at the project root:

```dockerfile
# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Create upload temp directory
RUN mkdir -p public/temp && chown -R appuser:appgroup public/

USER appuser

EXPOSE 8000

CMD ["node", "dist/index.js"]
```

---

### Step 1.6 — Create `docker-compose.yml`

Create `docker-compose.yml` at the project root:

```yaml
version: "3.9"

services:
  # ─── Application Server ──────────────────────────────────────────────────────
  app:
    build: .
    container_name: videotube_app
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./public:/app/public
    restart: unless-stopped

  # ─── BullMQ Worker Process ───────────────────────────────────────────────────
  worker:
    build: .
    container_name: videotube_worker
    command: node dist/workers/index.js
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  # ─── PostgreSQL ───────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: videotube_postgres
    environment:
      POSTGRES_USER: videotube
      POSTGRES_PASSWORD: password
      POSTGRES_DB: videotube
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U videotube"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ─── Redis ────────────────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: videotube_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

---

### Step 1.7 — Create `docker-compose.test.yml`

Create `docker-compose.test.yml` for isolated test database:

```yaml
version: "3.9"

services:
  postgres-test:
    image: postgres:16-alpine
    container_name: videotube_postgres_test
    environment:
      POSTGRES_USER: videotube_test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: videotube_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U videotube_test"]
      interval: 10s
      timeout: 5s
      retries: 5
```

---

### Step 1.8 — Create `docs/architecture.md`

Create `docs/architecture.md` with all system diagrams:

````markdown
# VideoTube — System Architecture

## Request Flow

```mermaid
flowchart LR
    Client -->|HTTP| Express
    Express --> RateLimit[Rate Limiter]
    RateLimit --> Auth[Auth Middleware]
    Auth --> Validate[Zod Validate]
    Validate --> Controller
    Controller --> Service
    Service --> Repository
    Repository --> Prisma
    Prisma --> PostgreSQL
    Service --> Cache[Redis Cache]
    Controller -->|Response| Client
    Express --> ErrorHandler[Centralized Error Handler]
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Auth Middleware
    participant J as JWT
    participant R as Repository
    C->>A: Request + Bearer Token (or Cookie)
    A->>J: jwt.verify(token, secret)
    J-->>A: decoded payload { userId }
    A->>R: findById(userId)
    R-->>A: User | null
    A-->>C: 401 if null
    A->>C: next() — req.user attached
```

## Video Upload Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant Ctrl as Controller
    participant Svc as VideoService
    participant CDN as Cloudinary
    participant DB as PostgreSQL
    participant Q as BullMQ Queue
    C->>Ctrl: POST /videos (multipart)
    Ctrl->>Svc: publishVideo(dto, files)
    Svc->>CDN: upload video + thumbnail
    CDN-->>Svc: publicId, secureUrl
    Svc->>DB: video.create status=UPLOADING
    Svc->>Q: enqueue video-processing job
    Svc-->>Ctrl: videoId, jobId
    Ctrl-->>C: 202 Accepted
```

## Worker Flow

```mermaid
flowchart TD
    Q[BullMQ video-processing] --> W[VideoWorker]
    W --> S1[status = PROCESSING]
    W --> S2[Fetch Cloudinary metadata]
    W --> S3[Update duration]
    W --> S4[status = READY]
    W --> S5[Enqueue notification jobs]
    S5 --> NQ[BullMQ notifications]
    NQ --> NW[NotificationWorker]
    NW --> DB[Insert Notifications]
    NW --> WS[WebSocket emit]
    W -->|failure| DLQ[Dead Letter Queue]
    W -->|failure| SE[status = FAILED]
```

## WebSocket Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Server
    participant AM as Auth Middleware
    participant CM as Connection Manager
    C->>WS: ws://host?token=JWT
    WS->>AM: validateToken(token)
    AM-->>WS: userId or reject 4001
    WS->>CM: register(userId, socket)
    loop Every 30s
        WS->>C: ping
        C->>WS: pong
    end
    Note over WS,C: No pong in 10s = terminate
    WS->>C: notification event
    WS->>C: video:progress event
```

## Notification Flow

```mermaid
flowchart LR
    Event[Video Published] --> NQ[Notification Queue]
    NQ --> NW[Notification Worker]
    NW --> DB[DB: createMany]
    NW --> CM[Connection Manager]
    CM -->|online| WS[WebSocket push]
    CM -->|offline| Skip[Fetched on next request]
```

## Queue Flow

```mermaid
flowchart TD
    subgraph Queues
        VQ[video-processing]
        NQ[notifications]
        CQ[cleanup]
    end
    subgraph Workers
        VW[VideoWorker]
        NW[NotificationWorker]
        CW[CleanupWorker cron]
    end
    VQ --> VW --> Ready[status=READY]
    VW -->|error| Failed[status=FAILED + DLQ]
    VW --> NQ
    NQ --> NW --> DB[Notifications in DB]
    NW --> WsEmit[WebSocket events]
    CQ --> CW --> Purge[Old records purged]
```
````

---

### Step 1.9 — Remove Nodemon

```bash
npm uninstall nodemon
```

Update any remaining `nodemon` references in `package.json` scripts (they will be replaced properly in Phase 2).

---

## Deliverables Checklist

- [ ] `.gitignore` updated
- [ ] `.env.example` created with all variables documented
- [ ] `README.md` rewritten with full setup instructions
- [ ] All 9 module directories created under `src/modules/`
- [ ] `src/config/`, `src/types/`, `src/middlewares/`, `src/utils/`, `src/queues/`, `src/workers/`, `src/websocket/` directories created
- [ ] `tests/unit/`, `tests/integration/`, `tests/helpers/` directories created
- [ ] `docs/architecture.md` created with all 6 Mermaid diagrams
- [ ] `Dockerfile` created (multi-stage)
- [ ] `docker-compose.yml` created (app + worker + postgres + redis)
- [ ] `docker-compose.test.yml` created (test postgres only)
- [ ] `.github/workflows/` directory created
- [ ] `public/temp/.gitkeep` created
- [ ] `nodemon` removed

---

## Verification

```bash
# 1. Docker infrastructure starts cleanly
docker-compose up postgres redis -d
# Both containers should reach "healthy" status

# 2. Folder structure is correct
ls src/modules/
# Should show: user video comment like subscription tweet playlist dashboard notification

# 3. No untracked build artifacts
git status
# Only new tracked files should appear

# 4. README renders
# Open README.md and verify all sections are present
```

---

## Notes

- The existing `src/` files remain as `.js` — they are untouched in this phase
- The `Dockerfile` references `npm run build` which does not yet exist — that's fine, it will be added in Phase 2
- `docker-compose up app` will fail until Phase 2 is complete — only use `postgres` and `redis` services in Phase 1
- The `docs/` directory is maintained separately from implementation — it is NOT an implementation phase deliverable, it is a living reference document
