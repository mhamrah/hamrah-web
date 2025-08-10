# Universal Authentication System

A comprehensive authentication solution for Qwik applications that supports both web sessions and mobile token-based authentication using Oslo for session management and Arctic for OAuth providers.

## Features

- **Universal Login**: Single authentication system for web and mobile clients
- **Multiple Auth Methods**: OAuth (Google, Apple), WebAuthn, and future extensibility
- **Secure Token Management**: Opaque tokens with 32-byte entropy and secure hashing
- **PKCE Support**: Complete PKCE implementation for mobile OAuth flows
- **Session Management**: Oslo-based session handling for web clients
- **Token Refresh**: Automatic token refresh with configurable expiration
- **Platform Tracking**: Track user login across different platforms
- **Cloudflare Integration**: Optimized for Cloudflare D1 and Pages deployment
- **Rate Limiting**: Cloudflare-based rate limiting (no app-level implementation needed)

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client   │    │   API Client    │
│  (Session-based)│    │ (Token-based)    │    │ (Token-based)   │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │    Universal Auth API    │
                    │  /api/auth/* endpoints   │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │     Auth Services        │
                    │ • Token Management       │
                    │ • Session Management     │
                    │ • OAuth Integration      │
                    │ • User Service           │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │    Cloudflare D1 DB      │
                    │ • users                  │
                    │ • sessions               │
                    │ • auth_tokens            │
                    │ • webauthn_credentials   │
                    └──────────────────────────┘
```

## Quick Start

### 1. Database Setup

Run the migrations to set up the required tables:

```bash
pnpm db:generate
pnpm db:migrate
```

### 2. Environment Variables

Ensure your OAuth providers are configured in your environment:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Apple OAuth
APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_private_key
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
```

### 3. Web Authentication Flow

```typescript
// Initiate OAuth (redirects to provider)
window.location.href = '/api/auth/oauth/google';

// After successful authentication, user is redirected with session cookie
// Check authentication status
const response = await fetch('/api/auth/user');
const { user } = await response.json();
```

### 4. Mobile Authentication Flow

```typescript
// Step 1: Initiate OAuth
const initResponse = await fetch('/api/auth/oauth/google', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    platform: 'ios', // or 'android'
    redirect_uri: 'yourapp://auth/callback' // your custom scheme
  })
});

const { authorization_url, state, code_verifier } = await initResponse.json();

// Step 2: Open authorization_url in system browser or web view
// User completes OAuth flow, your app receives callback with code

// Step 3: Exchange code for tokens
const tokenResponse = await fetch('/api/auth/callback/google', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: received_code,
    code_verifier: code_verifier,
    state: state,
    platform: 'ios'
  })
});

const { access_token, refresh_token, user } = await tokenResponse.json();

// Step 4: Use access_token for authenticated requests
const userResponse = await fetch('/api/auth/user', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
```

## API Reference

### Authentication Endpoints

#### `POST /api/auth/oauth/[provider]`

Initiate OAuth flow for web or mobile.

**Body:**
```json
{
  "platform": "web|ios|android|api",
  "redirect_uri": "optional custom redirect URI",
  "state": "optional custom state parameter"
}
```

**Response:**
```json
{
  "authorization_url": "https://...",
  "state": "random_state_value",
  "code_verifier": "pkce_code_verifier", // mobile only
  "expires_in": 600
}
```

#### `POST /api/auth/callback/[provider]`

Handle OAuth callback and exchange code for tokens (mobile).

**Body:**
```json
{
  "code": "oauth_code",
  "code_verifier": "pkce_code_verifier",
  "state": "state_parameter",
  "platform": "ios|android|api",
  "redirect_uri": "optional custom redirect"
}
```

**Response:**
```json
{
  "access_token": "opaque_token",
  "refresh_token": "refresh_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://..."
  }
}
```

#### `POST /api/auth/token/refresh`

Refresh an expired access token.

**Body:**
```json
{
  "refresh_token": "refresh_token"
}
```

**Response:**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### `POST /api/auth/token/exchange`

Exchange web session for mobile tokens.

**Body:**
```json
{
  "session_token": "session_cookie_value",
  "platform": "ios|android|api"
}
```

#### `GET /api/auth/user`

Get current user information.

**Headers:**
```
Authorization: Bearer access_token
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://...",
    "last_login_platform": "ios",
    "last_login_at": "2025-01-01T00:00:00.000Z"
  },
  "authentication_method": "token|session",
  "expires_at": "2025-01-01T01:00:00.000Z"
}
```

#### `POST /api/auth/logout`

Universal logout endpoint.

**Body (optional):**
```json
{
  "access_token": "optional_token_to_revoke",
  "logout_all": false // logout from all devices
}
```

## Database Schema

### `users` Table
- Core user information
- OAuth provider details
- Login tracking

### `sessions` Table
- Web session management
- Oslo-compatible format

### `auth_tokens` Table
- Mobile/API token storage
- Platform tracking
- Refresh token management

### `webauthn_credentials` Table
- WebAuthn credential storage
- Multi-device support

## Security Features

### Token Security
- 32-byte cryptographically secure tokens
- SHA-256 hashing for database storage
- Short access token lifetime (1 hour)
- Long refresh token lifetime (30 days)

### PKCE Implementation
- Complete RFC 7636 implementation
- S256 challenge method
- Secure code verifier generation

### Rate Limiting
- Cloudflare-based protection
- No application-level rate limiting needed
- See `CLOUDFLARE_RATE_LIMITING.md` for configuration

### Session Security
- HttpOnly cookies
- Secure flag for HTTPS
- SameSite protection
- Automatic session extension

## Development

### Running Tests

```bash
# Type checking
pnpm build.types

# Linting
pnpm lint

# Build verification
pnpm build
```

### Database Migrations

```bash
# Generate new migration
pnpm db:generate

# Apply migrations (local)
pnpm db:migrate

# Apply migrations (production)
pnpm db:migrate:remote
```

### Development Server

```bash
pnpm dev
```

## Deployment

### Cloudflare Pages

1. **Configure Environment Variables**: Set OAuth credentials in Cloudflare Pages dashboard
2. **Database Setup**: Ensure D1 database is created and migrations applied
3. **Rate Limiting**: Configure Cloudflare rate limiting rules (see documentation)
4. **Deploy**: Push to connected Git repository

### Environment Variables

Required variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_CLIENT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`

## File Structure

```
src/
├── lib/
│   ├── auth/
│   │   ├── tokens.ts          # Token management utilities
│   │   ├── session.ts         # Session management (Oslo)
│   │   ├── pkce.ts           # PKCE utilities
│   │   ├── user-service.ts   # User creation/lookup
│   │   └── providers.ts      # OAuth provider config
│   └── db/
│       ├── schema.ts         # Database schema
│       └── index.ts          # Database utilities
├── middleware/
│   └── auth.ts               # Authentication middleware
└── routes/
    ├── api/
    │   └── auth/             # Universal auth API endpoints
    │       ├── oauth/
    │       ├── callback/
    │       ├── token/
    │       ├── logout/
    │       └── user/
    └── auth/                 # Web authentication routes
```

## Client Libraries

### JavaScript/TypeScript

```typescript
class UniversalAuthClient {
  constructor(private baseURL: string) {}
  
  async initOAuth(provider: 'google' | 'apple', platform: Platform) {
    const response = await fetch(`${this.baseURL}/api/auth/oauth/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
    return response.json();
  }
  
  async exchangeCode(provider: string, code: string, codeVerifier: string, state: string, platform: Platform) {
    const response = await fetch(`${this.baseURL}/api/auth/callback/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        state,
        platform
      })
    });
    return response.json();
  }
  
  async refreshToken(refreshToken: string) {
    const response = await fetch(`${this.baseURL}/api/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    return response.json();
  }
  
  async getCurrentUser(accessToken: string) {
    const response = await fetch(`${this.baseURL}/api/auth/user`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return response.json();
  }
  
  async logout(accessToken?: string, logoutAll = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(`${this.baseURL}/api/auth/logout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ logout_all: logoutAll })
    });
    return response.json();
  }
}
```

## Troubleshooting

### Common Issues

1. **PKCE Verification Failed**: Ensure code_verifier is properly stored and transmitted
2. **Token Expired**: Implement automatic token refresh in clients
3. **CORS Issues**: Configure proper CORS for mobile requests
4. **State Mismatch**: Verify OAuth state parameter handling

### Debugging

Enable debug logging:
```typescript
// In your route handlers
console.log("Auth request:", {
  method: event.request.method,
  url: event.request.url,
  headers: Object.fromEntries(event.request.headers.entries())
});
```

## Contributing

1. Follow existing code patterns
2. Add tests for new functionality
3. Update documentation
4. Ensure security best practices

## License

This authentication system is part of your Qwik application and follows the same license terms.