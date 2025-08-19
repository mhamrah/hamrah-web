# Cloudflare Rate Limiting Configuration

This document outlines the recommended Cloudflare rate limiting rules for the universal authentication system to protect against abuse without implementing rate limiting in the application code.

## Overview

Cloudflare Rate Limiting provides DDoS protection and API abuse prevention at the edge, which is more efficient than application-level rate limiting. These rules should be configured in your Cloudflare dashboard.

## Recommended Rate Limiting Rules

### 1. OAuth Initiation Endpoints

**Path**: `/api/auth/oauth/*`
**Methods**: `POST`, `GET`

```
Rule Name: OAuth Initiation Rate Limit
Match:
  - URI Path contains "/api/auth/oauth/"
  - HTTP Method is POST or GET

Characteristics:
  - Requests per period: 10
  - Period: 1 minute
  - Action: Challenge (for legitimate traffic) or Block (for obvious abuse)
  - Count by: IP Address
```

**Rationale**: Limits OAuth initiation attempts to prevent abuse of provider APIs and credential stuffing attacks.

### 2. OAuth Callback Endpoints

**Path**: `/api/auth/callback/*`
**Methods**: `POST`, `GET`

```
Rule Name: OAuth Callback Rate Limit
Match:
  - URI Path contains "/api/auth/callback/"
  - HTTP Method is POST or GET

Characteristics:
  - Requests per period: 20
  - Period: 1 minute
  - Action: Challenge
  - Count by: IP Address
```

**Rationale**: Allows for legitimate OAuth flows while preventing callback abuse.

### 3. Token Refresh Endpoints

**Path**: `/api/auth/token/refresh`
**Methods**: `POST`

```
Rule Name: Token Refresh Rate Limit
Match:
  - URI Path is "/api/auth/token/refresh"
  - HTTP Method is POST

Characteristics:
  - Requests per period: 60
  - Period: 1 minute
  - Action: Challenge
  - Count by: IP Address
```

**Rationale**: More generous limit for token refresh as this is a common operation for mobile apps.

### 4. Login/Authentication Endpoints

**Path**: `/api/auth/token/exchange`, `/auth/login`, `/auth/*/callback`
**Methods**: `POST`, `GET`

```
Rule Name: Authentication Rate Limit
Match:
  - URI Path contains "/api/auth/token/exchange" OR
  - URI Path contains "/auth/login" OR
  - URI Path contains "/auth/" and ends with "/callback"
  - HTTP Method is POST or GET

Characteristics:
  - Requests per period: 30
  - Period: 5 minutes
  - Action: Block (after threshold)
  - Count by: IP Address
```

**Rationale**: Prevents brute force attacks and credential stuffing while allowing legitimate login attempts.

### 5. User Info Endpoints

**Path**: `/api/auth/user`
**Methods**: `GET`

```
Rule Name: User Info Rate Limit
Match:
  - URI Path is "/api/auth/user"
  - HTTP Method is GET

Characteristics:
  - Requests per period: 100
  - Period: 1 minute
  - Action: Challenge
  - Count by: IP Address
```

**Rationale**: High limit for user info requests as these are frequent in mobile apps.

### 6. Logout Endpoints

**Path**: `/api/auth/logout`
**Methods**: `POST`, `GET`

```
Rule Name: Logout Rate Limit
Match:
  - URI Path is "/api/auth/logout"
  - HTTP Method is POST or GET

Characteristics:
  - Requests per period: 20
  - Period: 1 minute
  - Action: Log (monitor but don't block)
  - Count by: IP Address
```

**Rationale**: Logout should rarely be rate-limited, but monitoring helps detect anomalies.

## Advanced Rate Limiting Rules

### 7. Global API Rate Limit

**Path**: `/api/*`
**Methods**: `ALL`

```
Rule Name: Global API Rate Limit
Match:
  - URI Path starts with "/api/"

Characteristics:
  - Requests per period: 1000
  - Period: 1 minute
  - Action: Challenge
  - Count by: IP Address
  - Exceptions: Exclude static assets, health checks
```

### 8. Suspicious Behavior Detection

```
Rule Name: Suspicious Auth Behavior
Match:
  - URI Path contains "/api/auth/"
  - Response Code is 401, 403, or 429

Characteristics:
  - Requests per period: 50 failed attempts
  - Period: 5 minutes
  - Action: Block for 10 minutes
  - Count by: IP Address
```

## Configuration Steps

### 1. Access Cloudflare Dashboard

1. Log in to your Cloudflare dashboard
2. Select your domain
3. Navigate to "Security" → "WAF" → "Rate limiting rules"

### 2. Create Rate Limiting Rules

For each rule above:

1. Click "Create rule"
2. Enter the rule name
3. Configure the match conditions using the "Custom filter expression"
4. Set the rate limiting parameters
5. Choose the appropriate action
6. Save the rule

### 3. Monitor and Adjust

1. Use Cloudflare Analytics to monitor rule effectiveness
2. Adjust thresholds based on legitimate traffic patterns
3. Review blocked requests to ensure no false positives

## Example Rule Configuration (Cloudflare API)

```json
{
  "action": "challenge",
  "description": "OAuth Initiation Rate Limit",
  "match": {
    "request": {
      "methods": ["GET", "POST"],
      "uri": {
        "path": {
          "contains": "/api/auth/oauth/"
        }
      }
    }
  },
  "threshold": 10,
  "period": 60,
  "correlate": {
    "by": "ip"
  }
}
```

## Monitoring and Alerts

### Recommended Alerts

1. **High Rate Limit Triggers**: Alert when rate limits are frequently triggered
2. **Authentication Failures**: Monitor 401/403 responses from auth endpoints
3. **Token Abuse**: Watch for patterns indicating token enumeration

### Metrics to Track

- Rate limit trigger frequency by endpoint
- Geographic distribution of blocked requests
- Success/failure ratios for authentication attempts
- Token refresh frequency patterns

## Security Considerations

1. **Bypass Protection**: Ensure rate limiting rules cannot be bypassed using different paths
2. **Distributed Attacks**: Consider rate limiting by ASN for sophisticated attacks
3. **Legitimate Traffic**: Whitelist known good IP ranges (office, partners) if needed
4. **Regional Variations**: Adjust limits based on expected regional usage patterns

## Testing Rate Limits

Use tools like `curl` or `ab` to test rate limiting effectiveness:

```bash
# Test OAuth initiation rate limit
for i in {1..15}; do
  curl -X POST https://yourdomain.com/api/auth/oauth/google \
    -H "Content-Type: application/json" \
    -d '{"platform": "api"}' \
    -w "Request $i: %{http_code}\n"
done
```

## Notes

- Rate limits should be adjusted based on your actual traffic patterns
- Consider implementing exponential backoff in mobile clients
- Monitor false positives and adjust rules accordingly
- Use Cloudflare's "Log" action during initial deployment to understand traffic patterns
- Consider using Cloudflare's Bot Management for more sophisticated protection

These rate limiting rules provide comprehensive protection for your universal authentication system while maintaining good user experience for legitimate traffic.
