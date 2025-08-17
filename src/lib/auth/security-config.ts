import type { RequestEventCommon } from '@builder.io/qwik-city';

/**
 * CORS configuration for OIDC and API endpoints
 */
export function configureCORS(event: RequestEventCommon): {
  origin: string | boolean;
  credentials: boolean;
  methods: string[];
  headers: string[];
} {
  const origin = event.request.headers.get('origin');
  const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
  const isCustomScheme = origin?.startsWith('hamrah://');
  const isHttps = origin?.startsWith('https://');

  // Determine if origin is allowed
  let allowedOrigin: string | boolean = false;

  if (isLocalhost && origin) {
    // Allow localhost for development
    allowedOrigin = origin;
  } else if (isCustomScheme && origin) {
    // Allow custom scheme for mobile apps
    allowedOrigin = origin;
  } else if (isHttps && origin && isAllowedDomain(origin)) {
    // Allow specific HTTPS domains in production
    allowedOrigin = origin;
  }

  return {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-Access-Token'
    ],
  };
}

/**
 * Check if domain is in allowed list
 */
function isAllowedDomain(origin: string): boolean {
  const allowedDomains = [
    // Add your production domains here
    'hamrah.app',
    'api.hamrah.app',
    'auth.hamrah.app',
  ];

  if (!origin) return false;

  try {
    const url = new URL(origin);
    return allowedDomains.some(domain => 
      url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Security headers for all responses
 */
export function getSecurityHeaders(event: RequestEventCommon): Record<string, string> {
  const isProduction = event.platform?.env?.NODE_ENV === 'production';

  return {
    // Prevent XSS attacks
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Qwik needs unsafe-inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' hamrah:",
      "frame-ancestors 'none'",
    ].join('; '),
    
    // HSTS for HTTPS
    ...(isProduction && {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    }),
    
    // Cache control for sensitive endpoints
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  identifier: string;
}

export function getRateLimitConfig(endpoint: string, event: RequestEventCommon): RateLimitConfig {
  const clientIp = event.request.headers.get('cf-connecting-ip') || 
                  event.request.headers.get('x-forwarded-for') || 
                  'unknown';

  const configs: Record<string, Omit<RateLimitConfig, 'identifier'>> = {
    '/oidc/auth': { windowMs: 3600000, maxRequests: 100 }, // 100/hour
    '/oidc/token': { windowMs: 3600000, maxRequests: 200 }, // 200/hour
    '/oidc/userinfo': { windowMs: 3600000, maxRequests: 1000 }, // 1000/hour
    '/api/v1/oauth/clients/register': { windowMs: 86400000, maxRequests: 10 }, // 10/day
    '/api/v1/user/profile': { windowMs: 3600000, maxRequests: 1000 }, // 1000/hour
  };

  const config = configs[endpoint] || { windowMs: 3600000, maxRequests: 100 };

  return {
    ...config,
    identifier: `${endpoint}:${clientIp}`,
  };
}

/**
 * Check rate limit using Cloudflare KV
 */
export async function checkRateLimit(
  event: RequestEventCommon, 
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  // If KV is not available, allow all requests (development mode)
  if (!event.platform?.env?.KV) {
    return { allowed: true, remaining: config.maxRequests, resetTime: Date.now() + config.windowMs };
  }

  const key = `rate_limit:${config.identifier}`;
  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const resetTime = windowStart + config.windowMs;

  try {
    const currentStr = await event.platform.env.KV.get(key);
    const current = currentStr ? parseInt(currentStr) : 0;

    if (current >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetTime };
    }

    // Increment counter
    await event.platform.env.KV.put(
      key, 
      (current + 1).toString(), 
      { expirationTtl: Math.ceil(config.windowMs / 1000) }
    );

    return { 
      allowed: true, 
      remaining: config.maxRequests - current - 1, 
      resetTime 
    };

  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Allow request if rate limiting fails
    return { allowed: true, remaining: config.maxRequests, resetTime };
  }
}

/**
 * Create rate limit exceeded response
 */
export function createRateLimitResponse(resetTime: number): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      error_description: 'Too many requests. Please try again later.',
      retry_after: Math.ceil((resetTime - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
        ...getSecurityHeaders({ request: { headers: new Headers() } } as any),
      },
    }
  );
}

/**
 * Add security headers to response
 */
export function addSecurityHeaders(response: Response, event: RequestEventCommon): Response {
  const headers = new Headers(response.headers);
  const securityHeaders = getSecurityHeaders(event);

  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}