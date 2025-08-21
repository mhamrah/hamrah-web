import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests-e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Set timeout */
  timeout: 30 * 1000, // 30 seconds per test
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ["github"],
        ["html"],
        ["json", { outputFile: "test-results/results.json" }],
        ["junit", { outputFile: "test-results/results.xml" }],
      ]
    : [["html"], ["list"]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "https://localhost:5173",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",

    /* Record video on failure */
    video: "retain-on-failure",

    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: process.env.CI
        ? /.*\.(spec|test)\.(js|ts|tsx)/
        : /.*\.(spec|test)\.(js|ts|tsx)/,
    },

    // Only run additional browsers in CI for critical tests or on main branch
    ...(process.env.CI &&
    (process.env.GITHUB_REF === "refs/heads/main" ||
      process.env.GITHUB_EVENT_NAME === "push")
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
          {
            name: "Mobile Chrome",
            use: { ...devices["Pixel 5"] },
          },
        ]
      : []),
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm dev",
    url: "https://localhost:5173",
    reuseExistingServer: true,
    ignoreHTTPSErrors: true,
    timeout: 120 * 1000, // 2 minutes to start the server
    env: {
      NODE_ENV: "test",
    },
  },

  /* Global setup and teardown - disabled for ES module compatibility */
  // globalSetup: "./tests-e2e/global-setup.ts",
  // globalTeardown: "./tests-e2e/global-teardown.ts",
});
