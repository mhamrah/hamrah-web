import { chromium, FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  console.log("🧪 Starting E2E test setup...");

  // Launch a browser to perform setup tasks
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for the development server to be ready
    console.log("⏳ Waiting for development server...");

    let retries = 0;
    const maxRetries = 30; // 30 seconds

    while (retries < maxRetries) {
      try {
        await page.goto("https://localhost:5173", {
          waitUntil: "networkidle",
          timeout: 10000,
        });
        console.log("✅ Development server is ready");
        break;
      } catch (error) {
        retries++;
        console.log(`⏳ Waiting for server... (${retries}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (retries === maxRetries) {
          throw new Error("Development server failed to start within timeout");
        }
      }
    }

    // Set up test database
    console.log("🗄️ Setting up test database...");

    // Create test user for authentication tests
    await setupTestUsers(page);

    // Set up test OAuth clients
    await setupTestOAuthClients(page);

    console.log("✅ E2E test setup completed");
  } catch (error) {
    console.error("❌ E2E test setup failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function setupTestUsers(page: any) {
  // You can make API calls to set up test users here
  // For now, we'll rely on the registration flow during tests
  console.log("👤 Test users will be created during test execution");
}

async function setupTestOAuthClients(page: any) {
  // Set up OAuth clients for testing
  console.log("🔑 OAuth clients already configured in migration");
}

export default globalSetup;
