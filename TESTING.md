# Testing Guide

This project uses a comprehensive testing strategy with multiple types of tests and CI/CD integration.

## 🧪 Test Types

### Unit Tests (Vitest)

- **Framework**: Vitest with JSdom
- **Location**: `src/**/*.test.ts`
- **Purpose**: Test individual functions, components, and modules

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:ui

# Run tests once
pnpm test:run

# Generate coverage report
pnpm test:coverage
```

### End-to-End Tests (Playwright)

- **Framework**: Playwright
- **Location**: `tests-e2e/*.spec.ts`
- **Purpose**: Test complete user workflows and integration

```bash
# Run E2E tests
pnpm test:e2e

# Run with UI mode
pnpm test:e2e:ui

# Run in headed mode (see browser)
pnpm test:e2e:headed

# Debug tests
pnpm test:e2e:debug
```

### Integration Tests

- **Location**: Mixed within unit tests
- **Purpose**: Test API endpoints, database operations, and service integrations

## 🚀 Running Tests

### Local Development

```bash
# Run all tests (comprehensive)
pnpm test:all

# Run quick CI tests
pnpm test:ci

# Run specific test types
pnpm lint              # Code linting
pnpm build.types       # Type checking
pnpm test:run          # Unit tests
pnpm test:coverage     # Coverage report
pnpm test:e2e          # E2E tests
```

### CI/CD Pipeline

The project uses multiple GitHub Actions workflows:

#### 1. CI Pipeline (`ci.yml`)

- Runs on: Push to main/develop, PRs
- **Node.js Version**: Uses `.nvmrc` (v23)
- **Steps**:
  1. Linting & Type checking
  2. Unit tests with coverage
  3. E2E tests
  4. Build verification
  5. Security scanning

#### 2. Pull Request Tests (`pr-tests.yml`)

- Runs on: PR creation and updates
- **Optimized for speed**:
  1. Quick checks (lint, types)
  2. Unit tests with coverage
  3. Build test
  4. Security audit
  5. Selective E2E tests (only for significant changes)

#### 3. Deployment (`deploy.yml`)

- Runs on: Main branch after tests pass
- **Steps**:
  1. Final verification
  2. Production build
  3. Deploy to Cloudflare Pages
  4. Post-deployment smoke tests

## 📊 Test Coverage

### Coverage Requirements

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

### Coverage Reports

- **Local**: `coverage/index.html`
- **CI**: Uploaded to Codecov
- **PR Comments**: Automatic coverage reports on PRs

## 🏷️ Test Tags and Organization

### Test Tags

Use tags in E2E tests for better organization:

```typescript
// Critical tests (always run in PRs)
test("login flow @critical", async ({ page }) => {
  // Test implementation
});

// Smoke tests (quick validation)
test("homepage loads @smoke", async ({ page }) => {
  // Test implementation
});

// Full tests (only run on main branch)
test("complete user journey @full", async ({ page }) => {
  // Test implementation
});
```

### Running Tagged Tests

```bash
# Run only critical tests
pnpm exec playwright test --grep "@critical"

# Run smoke tests
pnpm exec playwright test --grep "@smoke"

# Exclude specific tags
pnpm exec playwright test --grep-invert "@slow"
```

## 🛠️ Test Configuration

### Vitest Configuration

- **File**: `vitest.config.ts`
- **Coverage**: V8 provider
- **Environment**: JSdom for browser APIs
- **Watch**: Enabled by default

### Playwright Configuration

- **File**: `playwright.config.ts`
- **Browsers**: Chromium (PR), Firefox/Safari/Mobile (main branch)
- **Retries**: 2 on CI, 0 locally
- **Screenshots**: On failure
- **Videos**: On failure
- **Traces**: On first retry

## 🔧 Local Testing Setup

### Prerequisites

```bash
# Install dependencies
pnpm install

# Install Playwright browsers (first time only)
pnpm exec playwright install --with-deps
```

### Environment Setup

- Tests run against local dev server (`localhost:5173`)
- Use HTTPS for WebAuthn and secure features
- Database: In-memory SQLite for tests

### Debugging Tests

#### Unit Tests

```bash
# Debug specific test file
pnpm exec vitest run src/lib/auth/providers.test.ts

# Debug with debugger
pnpm exec vitest run --reporter=verbose
```

#### E2E Tests

```bash
# Debug mode (inspector opens)
pnpm test:e2e:debug

# Run specific test
pnpm exec playwright test tests-e2e/google-auth.spec.ts

# Run with browser visible
pnpm test:e2e:headed
```

## 📝 Writing Tests

### Unit Test Example

```typescript
import { test, expect, vi } from "vitest";
import { verifyGoogleToken } from "./providers";

test("verifyGoogleToken validates token correctly", async () => {
  // Mock external dependencies
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  // Test implementation
  const result = await verifyGoogleToken("valid-token");
  expect(result.email).toBe("test@example.com");
});
```

### E2E Test Example

```typescript
import { test, expect } from "@playwright/test";

test("user can login with Google @critical", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-testid="google-login"]');

  // Verify redirect and authentication
  await expect(page).toHaveURL("/dashboard");
  await expect(page.locator('[data-testid="user-name"]')).toBeVisible();
});
```

## 🚨 Troubleshooting

### Common Issues

1. **Playwright browser not found**

   ```bash
   pnpm exec playwright install --with-deps
   ```

2. **Tests failing in CI but passing locally**
   - Check timeout settings
   - Verify environment variables
   - Review CI-specific configurations

3. **Coverage not reporting correctly**
   - Ensure test files are in correct locations
   - Check Vitest configuration
   - Verify coverage thresholds

4. **E2E tests flaky**
   - Add explicit waits
   - Use `page.waitForLoadState()`
   - Check network conditions

### Getting Help

- Check test logs in GitHub Actions
- Review Playwright HTML reports (uploaded as artifacts)
- Check coverage reports in PR comments
- Use debug modes for local troubleshooting

## 🎯 Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
2. **Test Isolation**: Each test should be independent
3. **Mock External Services**: Don't hit real APIs in tests
4. **Use Page Objects**: For E2E tests, create reusable page objects
5. **Assert Meaningfully**: Use specific assertions rather than generic ones
6. **Keep Tests Fast**: Unit tests < 100ms, E2E tests < 30s
7. **Clean Up**: Ensure tests clean up after themselves
8. **Document Complex Tests**: Add comments for non-obvious test logic
