# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Qwik-based web application with Cloudflare Pages deployment support. The app uses Drizzle ORM for database operations with a D1 database on Cloudflare.

## Core Technologies

- [Qwik](https://qwik.dev/) - Core framework
- [QwikCity](https://qwik.dev/qwikcity/overview/) - Full-stack framework built on Qwik
- [Cloudflare Pages](https://pages.cloudflare.com/) - Deployment platform
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
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

### Database

```bash
# Generate Drizzle migration files
pnpm dlx drizzle-kit generate
```

## Key Files and Directories

- `src/routes/` - Contains page routes and layouts
- `src/components/` - Reusable components
- `drizzle/migrations/` - Database migrations
- `adapters/cloudflare-pages/` - Cloudflare Pages adapter configuration
- `public/` - Static assets

## Important Notes

- The project uses a pre-commit hook to run linting before commits.
- The app is configured to deploy to Cloudflare Pages and uses Cloudflare D1 as its database.