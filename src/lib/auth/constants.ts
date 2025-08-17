/**
 * Authentication and authorization constants
 * Centralized configuration for timeouts, limits, and other magic numbers
 */

// Key Management
export const KEY_ROTATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
export const KEY_ROTATION_INTERVAL_DAYS = 30;

// Token Expiration Times
export const ACCESS_TOKEN_LIFETIME_SECONDS = 3600; // 1 hour
export const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 3600; // 30 days  
export const ID_TOKEN_LIFETIME_SECONDS = 3600; // 1 hour
export const AUTHORIZATION_CODE_LIFETIME_SECONDS = 600; // 10 minutes

// Token Expiration Times in Milliseconds
export const ACCESS_TOKEN_LIFETIME_MS = ACCESS_TOKEN_LIFETIME_SECONDS * 1000;
export const REFRESH_TOKEN_LIFETIME_MS = REFRESH_TOKEN_LIFETIME_SECONDS * 1000;
export const AUTHORIZATION_CODE_LIFETIME_MS = AUTHORIZATION_CODE_LIFETIME_SECONDS * 1000;

// Session Configuration
export const SESSION_LIFETIME_SECONDS = 24 * 3600; // 1 day
export const INTERACTION_LIFETIME_SECONDS = 3600; // 1 hour

// Rate Limiting
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 3600 * 1000; // 1 hour
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 1000;
export const JWT_RATE_LIMIT_MAX_REQUESTS = 1000;

// Provider Cache
export const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Security Configuration
export const MIN_COOKIE_SECRET_LENGTH = 32;

// Database Configuration
export const TOKEN_CLEANUP_BATCH_SIZE = 100;
export const MAX_TOKENS_PER_USER = 10;

// OIDC Configuration
export const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
export const SUPPORTED_RESPONSE_TYPES = ['code', 'id_token', 'code id_token'];
export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];

// Cryptographic Configuration
export const RSA_KEY_SIZE = 2048;
export const SIGNING_ALGORITHM = 'RS256';
export const PKCE_CODE_CHALLENGE_METHOD = 'S256';

// Environment-based configuration
export const isDevelopment = () => process.env.NODE_ENV !== 'production';
export const isProduction = () => process.env.NODE_ENV === 'production';