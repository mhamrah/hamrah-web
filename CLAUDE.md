# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Qwik-based web application with Cloudflare Pages deployment support. The app follows an API-first architecture where all database operations are handled by hamrah-api via Cloudflare service bindings.

## Core Technologies

- [Qwik](https://qwik.dev/) - Core framework
- [QwikCity](https://qwik.dev/qwikcity/overview/) - Full-stack framework built on Qwik
- [Cloudflare Pages](https://pages.cloudflare.com/) - Deployment platform
- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/service-bindings/) - Internal API communication
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Programming language

## Commands

### Development

```bash
# Start development server with SSR
pnpm dev
# or with auto-open browser
pnpm start

# Debug mode
pnpm dev.debug
```

### Building

```bash
# Full build (client + server)
pnpm build

# Individual build steps
pnpm build.client  # Build client only
pnpm build.server  # Build server for Cloudflare Pages
pnpm build.preview # Build for preview
pnpm build.types   # TypeScript type checking
```

### Linting and Formatting

```bash
# Lint code
pnpm lint

# Format code
pnpm fmt

# Check formatting
pnpm fmt.check
```

### Preview and Deployment

```bash
# Preview production build locally
pnpm preview

# Serve Cloudflare Pages locally
pnpm serve

# Deploy to Cloudflare
pnpm deploy
```

## Key Files and Directories

- `src/routes/` - Contains page routes and layouts
- `src/components/` - Reusable components
- `src/lib/auth/api-client.ts` - Centralized API client for hamrah-api communication
- `src/lib/auth/session.ts` - Session management via API calls
- `worker-configuration.d.ts` - TypeScript definitions for Cloudflare Worker environment
- `public/` - Static assets

## Development Guidelines and Best Practices

### Qwik Development Standards

- **Always prefer functional components** in all `.ts` and `.tsx` files
- **Use TypeScript** for all `.ts` and `.tsx` files to ensure type safety and improved code maintainability
- **Use `$` suffix** for lazy-loaded functions (e.g., `onClick$`, `onSubmit$`)
- **Utilize `useSignal()`** for reactive state management
- **Use `server$`** for server-side code execution within Qwik components
- **Utilize Qwik City** for routing when applicable (in `src/routes/` directory)
- **Follow Qwik naming conventions** consistently throughout the codebase

### Database and Architecture Standards

- **NO DIRECT DATABASE ACCESS**: This web application does NOT access databases directly. All data operations must go through hamrah-api via the API client.
- **Use HamrahApiClient**: All database operations should use the centralized `createApiClient()` function from `~/lib/auth/api-client.ts`
- **Service Bindings Only**: Internal API calls use Cloudflare service bindings (AUTH_API) with internal authentication headers
- **API-First Architecture**: The web layer handles only UI, OAuth flows, and client-side logic

### Tailwind CSS Standards

- **Implement Tailwind CSS classes** for styling instead of custom CSS when possible
- **Use `@apply` directive** in CSS files for reusable styles
- **Use Tailwind's `@layer` directive** for custom styles to maintain organization and prevent conflicts
- **Implement responsive design** using Tailwind's responsive classes (`sm:`, `md:`, `lg:`, etc.)
- **Follow Tailwind naming conventions** consistently
- **Implement dark mode** using Tailwind's `dark:` variant for user-friendly experience
- **Implement proper Tailwind CSS purging** for production builds to reduce bundle size

### Project Structure Standards

Follow this recommended folder structure:

```
src/
  components/     # Reusable components
  routes/        # Page routes and layouts
  global.css     # Global styles
  root.tsx       # Root component
  entry.ssr.tsx  # SSR entry point
public/          # Static assets
tailwind.config.js
postcss.config.js
vite.config.ts
tsconfig.json
```

### Build and Development Standards

- **Leverage Vite plugins** for optimized Qwik builds to improve performance and efficiency
- **Use Vite's fast HMR** for development
- **Utilize Tailwind's configuration file** for customization
- **Always write unit tests to validate every change**
- **Always create or refactor a playwrite test when doing any UI changes**
- **Always run `pnpm fmt` after writing to disk to adhere to prettier standards. Also following coding standards specified in prettier**

## Git and Version Control Guidelines

- **Always create a git workspace and branch when starting a new set of changes.**
- **Always create a PR to merge to main. Never merge to main directly.**
- **Create a succinct commit message for the PR and outline the change in the description.**

## Architecture Overview

### Authentication Flow
1. **OAuth Integration**: Handles Apple/Google OAuth flows in the web layer
2. **API Communication**: All user creation, session management via hamrah-api
3. **Session Storage**: Session tokens stored in HTTP-only cookies
4. **WebAuthn Support**: Passkey authentication flows call hamrah-api WebAuthn endpoints

### API Integration
- **Internal Endpoints**: Use service bindings with `X-Internal-Service` and `X-Internal-Key` headers
- **Public Endpoints**: Standard REST API calls to hamrah-api for client-side operations
- **Error Handling**: Centralized error handling in API client with proper error propagation

## Important Notes

- The project uses a pre-commit hook to run linting before commits.
- The app is configured to deploy to Cloudflare Pages with service binding to hamrah-api.
- **NO DATABASE**: This app does NOT have its own database - all data comes from hamrah-api.
- Always run lint and ensure zero errors or warnings before checking in code.

## Environment Variables Required

```bash
# Cloudflare Worker Environment
AUTH_API=<service-binding-to-hamrah-api>

# OAuth Configuration
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
APPLE_CLIENT_ID=<apple-oauth-client-id>
APPLE_CLIENT_SECRET=<apple-oauth-client-secret>
```
