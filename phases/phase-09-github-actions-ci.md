# Phase 9 — GitHub Actions CI Pipeline

> **Status**: Not started  
> **Estimated Time**: 2–3 hours  
> **Prerequisite**: Phase 8 complete  
> **Scope**: Implement a full CI pipeline with 4 jobs: code quality, unit tests, integration tests (with Postgres service container), and build verification. All jobs are required merge gates.

---

## Objective

Every pull request to `main` or `develop` must pass a full automated quality gate before it can be merged. No manual bypassing allowed.

---

## Step 9.1 — Pipeline Architecture

```
Push / PR
    │
    ├─── quality (type-check + lint) ────────────────────────┐
    │                                                          │
    └─── unit-tests ──────────────────────────────────────────┤──→ build
                                                               │
         integration-tests (needs: quality) ─────────────────┘
```

- `quality` and `unit-tests` run in **parallel**
- `integration-tests` **requires** `quality` to pass first (prevents wasting DB container time if code has type errors)
- `build` requires **both** test jobs to pass

---

## Step 9.2 — Create the Workflow File

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main
      - develop

# Cancel in-progress runs for the same branch (saves CI minutes)
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "20"

jobs:
  # ─────────────────────────────────────────────────────────────────────────────
  # Job 1: Code Quality — TypeScript type checking + ESLint
  # ─────────────────────────────────────────────────────────────────────────────
  quality:
    name: Type Check & Lint
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: TypeScript type check
        run: npm run type-check

      - name: ESLint
        run: npm run lint

  # ─────────────────────────────────────────────────────────────────────────────
  # Job 2: Unit Tests — no external services needed
  # ─────────────────────────────────────────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    # Run in parallel with quality — no dependency

    env:
      NODE_ENV: test
      # Unit tests mock all external services — these values are placeholders
      DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
      REDIS_URL: redis://localhost:6379
      ACCESS_TOKEN_SECRET: test-access-secret-minimum-32-characters-placeholder
      REFRESH_TOKEN_SECRET: test-refresh-secret-minimum-32-characters-placeholder
      ACCESS_TOKEN_EXPIRY: 15m
      REFRESH_TOKEN_EXPIRY: 7d
      CLOUDINARY_CLOUD_NAME: test
      CLOUDINARY_API_KEY: test
      CLOUDINARY_API_SECRET: test
      CORS_ORIGIN: http://localhost:3000
      LOG_LEVEL: silent

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run unit tests with coverage
        run: npm run test:unit -- --coverage

      - name: Upload unit test coverage
        uses: actions/upload-artifact@v4
        if: always()   # Upload even if tests fail, for debugging
        with:
          name: unit-coverage-report
          path: coverage/
          retention-days: 14

  # ─────────────────────────────────────────────────────────────────────────────
  # Job 3: Integration Tests — spins up a real PostgreSQL container
  # ─────────────────────────────────────────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [quality]   # Only run if code quality passes — avoid wasting DB time

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: videotube_test
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: videotube_test
        ports:
          - "5432:5432"
        options: >-
          --health-cmd "pg_isready -U videotube_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      NODE_ENV: test
      TEST_TYPE: integration
      DATABASE_URL: postgresql://videotube_test:test_password@localhost:5432/videotube_test
      REDIS_URL: redis://localhost:6379   # Mocked in integration test setup
      ACCESS_TOKEN_SECRET: ${{ secrets.ACCESS_TOKEN_SECRET }}
      REFRESH_TOKEN_SECRET: ${{ secrets.REFRESH_TOKEN_SECRET }}
      ACCESS_TOKEN_EXPIRY: 15m
      REFRESH_TOKEN_EXPIRY: 7d
      CLOUDINARY_CLOUD_NAME: ${{ secrets.CLOUDINARY_CLOUD_NAME }}
      CLOUDINARY_API_KEY: ${{ secrets.CLOUDINARY_API_KEY }}
      CLOUDINARY_API_SECRET: ${{ secrets.CLOUDINARY_API_SECRET }}
      CORS_ORIGIN: http://localhost:3000
      LOG_LEVEL: silent

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run Prisma migrations on test database
        run: npx prisma migrate deploy

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload integration test results
        uses: actions/upload-artifact@v4
        if: failure()   # Only upload on failure for debugging
        with:
          name: integration-test-results
          path: |
            coverage/
            test-results/
          retention-days: 7

  # ─────────────────────────────────────────────────────────────────────────────
  # Job 4: Build — verifies TypeScript compilation produces valid output
  # ─────────────────────────────────────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]   # Only build if all tests pass

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ env.NODE_VERSION }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Build TypeScript
        run: npm run build

      - name: Verify dist/ output
        run: |
          # Verify the main entry points exist in the compiled output
          test -f dist/index.js && echo "✅ dist/index.js exists"
          test -f dist/workers/index.js && echo "✅ dist/workers/index.js exists"

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: production-build
          path: dist/
          retention-days: 7
```

---

## Step 9.3 — Add `.github/CODEOWNERS` (Optional but Professional)

Create `.github/CODEOWNERS`:

```
# Global owner — all changes require review
* @your-github-username
```

---

## Step 9.4 — Add Pull Request Template

Create `.github/pull_request_template.md`:

```markdown
## Summary
Brief description of what this PR changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation

## Testing
- [ ] All existing tests pass (`npm run test`)
- [ ] New tests added for new functionality
- [ ] Coverage remains above 90%

## Checklist
- [ ] Code follows the Controller → Service → Repository pattern
- [ ] No `prisma.*` calls in controllers
- [ ] No `express` types in services
- [ ] ESLint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] `console.*` not used (use `logger.*`)
```

---

## Step 9.5 — Configure Repository Secrets

In GitHub → Repository → Settings → Secrets and Variables → Actions → New repository secret:

| Secret Name | Description | Example |
|---|---|---|
| `ACCESS_TOKEN_SECRET` | JWT access token signing secret (min 32 chars) | Random 64-char hex string |
| `REFRESH_TOKEN_SECRET` | JWT refresh token signing secret (min 32 chars) | Random 64-char hex string |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name | `my-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `abcdef_randomstring` |

Generate secure secrets:
```bash
# Generate cryptographically secure random secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Step 9.6 — Configure Branch Protection Rules

In GitHub → Repository → Settings → Branches → Add rule → Rule for `main`:

**Settings to enable:**

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ Enabled |
| Require approvals | 1 (or 0 for solo project) |
| Require status checks to pass before merging | ✅ Enabled |
| Require branches to be up to date before merging | ✅ Enabled |
| Do not allow bypassing the above settings | ✅ Enabled |
| Restrict who can push to matching branches | Optional |

**Required status checks** (search and add each):
- `Type Check & Lint`
- `Unit Tests`
- `Integration Tests`
- `Build`

> **Note**: Status checks only appear in the search after the first CI run. Push a test branch and create a PR first to populate the available checks.

---

## Step 9.7 — Pipeline Failure Conditions

| Condition | Job | Effect on PR |
|---|---|---|
| `tsc --noEmit` exits non-zero | `quality` | ❌ Blocked |
| ESLint exits non-zero | `quality` | ❌ Blocked |
| Any unit test fails | `unit-tests` | ❌ Blocked |
| Coverage below threshold | `unit-tests` | ❌ Blocked |
| Any integration test fails | `integration-tests` | ❌ Blocked |
| `npm run build` exits non-zero | `build` | ❌ Blocked |
| All jobs pass | All | ✅ Merge allowed |

---

## Step 9.8 — Local CI Validation

Before pushing, validate locally to save CI time:

```bash
# Run the full CI suite locally
npm run type-check && \
npm run lint && \
npm run test:unit && \
npm run build && \
echo "✅ Local CI passed — safe to push"
```

Add as a `pre-push` git hook using `simple-git-hooks`:

```bash
npm install -D simple-git-hooks
```

Add to `package.json`:
```json
{
  "simple-git-hooks": {
    "pre-push": "npm run type-check && npm run lint && npm run test:unit"
  }
}
```

```bash
npx simple-git-hooks
```

---

## Step 9.9 — Workflow Status Badge

Add to `README.md` (replace `YOUR_USERNAME/YOUR_REPO`):

```markdown
## Status

[![CI](https://github.com/YOUR_USERNAME/video-tube-main/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/video-tube-main/actions/workflows/ci.yml)
```

---

## Deliverables Checklist

- [ ] `.github/workflows/ci.yml` created
- [ ] `.github/pull_request_template.md` created
- [ ] `.github/CODEOWNERS` created (optional)
- [ ] 5 repository secrets configured in GitHub Settings
- [ ] Branch protection rules enabled for `main`
- [ ] All 4 required status checks configured
- [ ] `simple-git-hooks` pre-push hook configured (optional)
- [ ] CI badge added to README

---

## Verification

```bash
# 1. Trigger CI on a test branch
git checkout -b test/ci-verification
echo "// CI test" >> src/app.ts
git add . && git commit -m "test: trigger CI pipeline"
git push origin test/ci-verification

# Open a PR from this branch → GitHub Actions should start automatically

# 2. Verify all 4 jobs appear and pass:
# GitHub → Pull Requests → Your PR → Checks tab
# Expected: 4 green check marks:
#   ✅ Type Check & Lint
#   ✅ Unit Tests
#   ✅ Integration Tests
#   ✅ Build

# 3. Introduce a type error to verify blocking
echo "const x: number = 'hello'" >> src/app.ts
git add . && git commit -m "test: break type check"
git push
# Expected: "Type Check & Lint" fails, PR shows red status, merge button disabled

# 4. Introduce a failing test
# In any service test file, change: expect(result).toBe('correct') → .toBe('wrong')
# Expected: "Unit Tests" fails, merge blocked

# 5. Fix everything and verify green pipeline
git revert HEAD~2..HEAD
git push
# Expected: All 4 checks pass, merge button re-enabled

# 6. Verify build artifacts
# GitHub → Actions → Latest run → Summary → Artifacts
# Expected: "production-build" artifact (dist/ zip) downloadable

# 7. Verify coverage artifact
# GitHub → Actions → Latest run → Artifacts
# Expected: "unit-coverage-report" artifact with HTML coverage report
```

---

## Notes

- **CI minutes**: The `concurrency` configuration cancels in-progress runs when new commits are pushed to the same branch. This prevents wasted minutes on stale runs.
- **Secret security**: Never log secrets in CI. The `LOG_LEVEL=silent` in test env prevents any secret leakage through Pino.
- **Integration test isolation**: Each integration test run starts with a clean database (see `tests/setup.ts` `beforeEach` cleanup). The Postgres service container is recreated for each workflow run.
- **Prisma generate in CI**: `npx prisma generate` must run before TypeScript compilation because the generated Prisma client types are needed for the TypeScript compiler. This is why it appears in every job.
- **Cloudinary in integration tests**: Cloudinary calls are mocked in `tests/setup.ts`. The `CLOUDINARY_*` secrets are still needed because `env.ts` validates them at startup — use dummy values for unit tests, real secrets for integration tests.
