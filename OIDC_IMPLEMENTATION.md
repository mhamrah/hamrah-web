# OpenID Connect Authorization Server Implementation

This document describes the OpenID Connect (OIDC) Authorization Server implementation for the Hamrah iOS app authentication.

## Overview

The implementation provides a complete OAuth 2.0 + OpenID Connect authorization server that allows the Hamrah iOS app to authenticate users and access protected APIs. The system follows security best practices for mobile applications including PKCE (Proof Key for Code Exchange) and proper token validation.

## Architecture

### Components

1. **OIDC Provider** (`/src/lib/auth/oidc-config.ts`)
   - Core OpenID Connect server using panva/oidc-provider
   - Handles authorization, token, and userinfo endpoints
   - Supports PKCE for mobile app security

2. **Client Management** (`/src/lib/auth/client-manager.ts`)
   - Dynamic OAuth client registration
   - Client validation and credential management
   - Support for native (mobile) and web applications

3. **JWT Token Validation** (`/src/lib/auth/jwt-validator.ts`)
   - JWT access token validation for API protection
   - Token introspection and scope validation
   - Rate limiting for token validation endpoints

4. **Security Configuration** (`/src/lib/auth/security-config.ts`)
   - CORS configuration for mobile apps
   - Rate limiting and security headers
   - Origin validation and security policies

## Endpoints

### OIDC Endpoints (Base: `/oidc/`)

- `/.well-known/openid_configuration` - OIDC discovery document
- `/auth` - Authorization endpoint (OAuth 2.0 authorization)
- `/token` - Token endpoint (exchange authorization code for tokens)
- `/userinfo` - UserInfo endpoint (get user profile data)
- `/jwks` - JSON Web Key Set (public keys for token verification)
- `/revocation` - Token revocation endpoint
- `/introspection` - Token introspection endpoint

### Client Management Endpoints

- `POST /api/v1/oauth/clients/register` - Register new OAuth client
- `GET /api/v1/oauth/clients/register` - Get registration documentation

### Protected API Endpoints

- `GET /api/v1/user/profile` - Get user profile (requires JWT token)
- `PATCH /api/v1/user/profile` - Update user profile (requires JWT token)

## Mobile App Integration

### 1. Client Registration

First, register your iOS app as an OAuth client:

```bash
curl -X POST https://your-domain.com/api/v1/oauth/clients/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Hamrah iOS App",
    "application_type": "native",
    "redirect_uris": ["hamrah://auth/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "scopes": ["openid", "profile", "email"]
  }'
```

Response:
```json
{
  "client_id": "hamrah_abc123...",
  "client_name": "Hamrah iOS App",
  "application_type": "native",
  "redirect_uris": ["hamrah://auth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scopes": ["openid", "profile", "email"],
  "require_auth_time": true,
  "created_at": "2025-01-16T..."
}
```

### 2. Authorization Flow (PKCE)

The iOS app should implement the Authorization Code Flow with PKCE:

#### Step 1: Generate PKCE Parameters
```swift
// Generate code verifier (random string)
let codeVerifier = generateCodeVerifier()

// Generate code challenge (SHA256 hash of verifier, base64url encoded)
let codeChallenge = generateCodeChallenge(from: codeVerifier)
```

#### Step 2: Authorization Request
Open browser/web view with authorization URL:

```
https://your-domain.com/oidc/auth?
  client_id=hamrah_abc123...&
  response_type=code&
  scope=openid+profile+email&
  redirect_uri=hamrah://auth/callback&
  code_challenge=YOUR_CODE_CHALLENGE&
  code_challenge_method=S256&
  state=random_state_value
```

#### Step 3: Handle Callback
Capture the authorization code from the redirect URI:

```
hamrah://auth/callback?code=AUTH_CODE&state=random_state_value
```

#### Step 4: Exchange Code for Tokens
```swift
let tokenRequest = [
    "grant_type": "authorization_code",
    "client_id": "hamrah_abc123...",
    "code": "AUTH_CODE",
    "redirect_uri": "hamrah://auth/callback",
    "code_verifier": codeVerifier
]

// POST to https://your-domain.com/oidc/token
```

Response:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "scope": "openid profile email"
}
```

### 3. API Requests

Use the access token to make authenticated API requests:

```swift
var request = URLRequest(url: URL(string: "https://your-domain.com/api/v1/user/profile")!)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

// Make the request
```

### 4. Token Refresh

When the access token expires, use the refresh token:

```swift
let refreshRequest = [
    "grant_type": "refresh_token",
    "client_id": "hamrah_abc123...",
    "refresh_token": refreshToken
]

// POST to https://your-domain.com/oidc/token
```

## Security Features

### 1. PKCE (Proof Key for Code Exchange)
- Required for all native/mobile clients
- Prevents authorization code interception attacks
- Uses SHA256 challenge method

### 2. JWT Token Validation
- All API endpoints validate JWT access tokens
- Tokens are signed with RS256 algorithm
- Includes scope and client validation

### 3. Rate Limiting
- Authorization endpoint: 50 requests/hour per IP
- Token endpoint: 200 requests/hour per IP
- API endpoints: 1000 requests/hour per IP
- Uses Cloudflare KV for distributed rate limiting

### 4. CORS Configuration
- Allows requests from custom scheme (`hamrah://`)
- Supports localhost for development
- Strict origin validation for production

### 5. Security Headers
- Comprehensive CSP, HSTS, and other security headers
- XSS protection and content type sniffing prevention
- Frame options and referrer policy

## Database Schema

### OAuth Clients Table
```sql
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  client_secret TEXT,
  client_name TEXT NOT NULL,
  application_type TEXT NOT NULL,
  redirect_uris TEXT NOT NULL, -- JSON array
  grant_types TEXT NOT NULL,   -- JSON array
  response_types TEXT NOT NULL, -- JSON array
  token_endpoint_auth_method TEXT NOT NULL,
  scopes TEXT NOT NULL,        -- JSON array
  require_auth_time BOOLEAN DEFAULT FALSE,
  default_max_age INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Configuration

### Environment Variables

Add these to your Cloudflare environment:

```bash
# Required for OIDC provider
COOKIE_SECRET=your-secure-cookie-secret-here

# Optional for enhanced security
NODE_ENV=production
```

### Cloudflare KV Namespace

Create a KV namespace named `AUTH_KV` for rate limiting and caching.

## Deployment

1. **Database Migration**
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

2. **Environment Setup**
   - Configure environment variables in Cloudflare
   - Set up KV namespace binding

3. **Deploy**
   ```bash
   pnpm deploy
   ```

## Testing

### 1. Discovery Endpoint
```bash
curl https://your-domain.com/oidc/.well-known/openid_configuration
```

### 2. Client Registration
```bash
curl -X POST https://your-domain.com/api/v1/oauth/clients/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Test App","application_type":"native","redirect_uris":["test://callback"]}'
```

### 3. Authorization Flow
1. Open authorization URL in browser
2. Complete login flow
3. Capture authorization code from callback
4. Exchange code for tokens
5. Use access token for API requests

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure redirect URI uses `hamrah://` scheme
   - Check origin validation in security config

2. **Token Validation Failures**
   - Verify JWT signature with public keys from `/oidc/jwks`
   - Check token expiration and scope claims

3. **Rate Limiting**
   - Monitor rate limit headers in responses
   - Implement exponential backoff in client

4. **PKCE Errors**
   - Ensure code_verifier and code_challenge are correctly generated
   - Verify challenge method is `S256`

### Debug Mode

For development, you can disable certain security features:

```typescript
// In oidc-config.ts
const isDevelopment = process.env.NODE_ENV !== 'production';

// Disable PKCE for testing (NOT recommended for production)
pkce: {
  required: () => !isDevelopment,
  methods: ['S256']
}
```

## Security Considerations

1. **Never include client secrets in mobile apps**
2. **Always use PKCE for native applications**
3. **Validate all tokens on the server side**
4. **Implement proper rate limiting**
5. **Use HTTPS in production**
6. **Regularly rotate signing keys**
7. **Monitor for suspicious authentication patterns**

## Support

For issues or questions about the OIDC implementation:

1. Check this documentation
2. Review the source code in `/src/lib/auth/`
3. Test endpoints using the provided curl examples
4. Monitor logs for error details