# VideoTube Backend

[![CI](https://github.com/Onkar3107/video-tube/actions/workflows/ci.yml/badge.svg)](https://github.com/Onkar3107/video-tube/actions/workflows/ci.yml)

A production-ready YouTube-like backend demonstrating modern Node.js backend engineering practices.

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
