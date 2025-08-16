# OIDC Setup Guide

This guide will help you set up the OpenID Connect Authorization Server for your iOS app.

## 1. Prerequisites

- Cloudflare account with Workers/Pages access
- `pnpm` installed
- Access to Cloudflare dashboard

## 2. Set up KV Namespace

The OIDC implementation uses Cloudflare KV for rate limiting and token storage.

### Option A: Use the setup script
```bash
./scripts/setup-kv.sh
```

### Option B: Manual setup
```bash
# Login to Cloudflare
pnpm wrangler login

# Create production KV namespace
pnpm wrangler kv:namespace create "AUTH_KV"

# Create preview KV namespace  
pnpm wrangler kv:namespace create "AUTH_KV_PREVIEW"
```

### Update wrangler.jsonc
Replace the placeholder IDs in `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "your-production-kv-id-here",
    "preview_id": "your-preview-kv-id-here"
  },
],
```

## 3. Configure Secrets

Set up the required secrets for OIDC:

```bash
# Required: Cookie signing secret (generate a random 32+ character string)
pnpm wrangler secret put COOKIE_SECRET

# Required: Existing OAuth secrets
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put APPLE_CERTIFICATE
```

## 4. Run Database Migration

```bash
# Generate and run the OAuth clients migration
pnpm db:generate
pnpm db:migrate
```

## 5. Deploy

```bash
pnpm deploy
```

## 6. Test the Setup

### Test Discovery Endpoint
```bash
# Primary OIDC discovery endpoint
curl https://your-domain.com/.well-known/openid_configuration

# Alternative endpoint (directly accessible)
curl https://your-domain.com/oidc/openid_configuration
```

Expected response:
```json
{
  "issuer": "https://your-domain.com",
  "authorization_endpoint": "https://your-domain.com/oidc/auth",
  "token_endpoint": "https://your-domain.com/oidc/token",
  "userinfo_endpoint": "https://your-domain.com/oidc/userinfo",
  "jwks_uri": "https://your-domain.com/oidc/jwks",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic"],
  "code_challenge_methods_supported": ["S256"]
}
```

### Test JWKS Endpoint
```bash
curl https://your-domain.com/oidc/jwks
```

### Register iOS Client
```bash
curl -X POST https://your-domain.com/api/v1/oauth/clients/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Hamrah iOS App",
    "application_type": "native",
    "redirect_uris": ["hamrah://auth/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

## 7. OIDC Endpoints

The following endpoints are now available:

### Core OIDC Endpoints
- `GET /.well-known/openid_configuration` - Discovery document (redirected from Cloudflare)
- `GET /oidc/openid_configuration` - Discovery document (direct access)
- `GET /oidc/auth` - Authorization endpoint (redirects to login)
- `POST /oidc/token` - Token exchange endpoint
- `GET /oidc/userinfo` - User information endpoint
- `GET /oidc/jwks` - JSON Web Key Set
- `POST /oidc/revocation` - Token revocation
- `POST /oidc/introspection` - Token introspection

### Client Management
- `POST /api/v1/oauth/clients/register` - Register new OAuth client
- `GET /api/v1/oauth/clients/register` - Registration documentation

### Protected APIs (Examples)
- `GET /api/v1/user/profile` - Get user profile (requires JWT)
- `PATCH /api/v1/user/profile` - Update user profile (requires JWT)

## 8. iOS App Integration

### Step 1: Register Your App
Use the client registration endpoint to get a `client_id`.

### Step 2: Authorization Flow
1. Generate PKCE parameters
2. Redirect to `/oidc/auth` with PKCE
3. Handle callback with authorization code
4. Exchange code for tokens at `/oidc/token`

### Step 3: API Access
Use the access token in the `Authorization: Bearer <token>` header.

## 9. Security Features

✅ **PKCE Required** - All native apps must use PKCE
✅ **JWT Access Tokens** - Stateless, signed with RS256
✅ **Rate Limiting** - Distributed rate limiting with KV
✅ **CORS Protection** - Secure origin validation
✅ **Security Headers** - CSP, HSTS, XSS protection
✅ **No Client Secrets** - Mobile apps use public authentication

## 10. Monitoring

### Check Logs
```bash
pnpm wrangler tail
```

### Monitor KV Usage
```bash
pnpm wrangler kv:key list --binding=KV
```

## 11. Troubleshooting

### Common Issues

**"KV binding not found"**
- Ensure KV namespace is created and configured in wrangler.jsonc
- Verify the binding name is "KV"

**"Cookie secret not configured"**
- Set the COOKIE_SECRET using `pnpm wrangler secret put COOKIE_SECRET`

**"Invalid client"**
- Ensure the OAuth client is registered in the database
- Check the client_id in your requests

**CORS errors**
- Verify your app's redirect URI uses the `hamrah://` scheme
- Check the origin validation in security config

### Debug Mode

For development, you can check the well-known endpoint:
```bash
curl -s https://localhost:5174/oidc/.well-known/openid_configuration | jq .
```

## 12. Production Checklist

- [ ] KV namespace created and configured
- [ ] Secrets configured (COOKIE_SECRET, etc.)
- [ ] Database migration completed
- [ ] iOS client registered
- [ ] HTTPS enabled
- [ ] Domain configured in wrangler.jsonc
- [ ] Rate limiting tested
- [ ] Complete OAuth flow tested

## Next Steps

1. Complete the setup steps above
2. Test all endpoints
3. Integrate with your iOS application
4. Monitor usage and performance
5. Consider additional security measures for production