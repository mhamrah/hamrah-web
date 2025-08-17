import { Provider } from 'oidc-provider';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { createOIDCProvider } from './oidc-config';

interface CachedProvider {
  provider: Provider;
  createdAt: number;
  issuer: string;
}

// Cache providers by issuer
const providerCache = new Map<string, CachedProvider>();

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get or create cached OIDC provider
 */
export async function getCachedOIDCProvider(
  issuer: string,
  event: RequestEventCommon
): Promise<Provider> {
  const cached = providerCache.get(issuer);
  
  // Check if cached provider is still valid
  if (cached && (Date.now() - cached.createdAt) < CACHE_TTL) {
    return cached.provider;
  }

  // Create new provider
  const provider = await createOIDCProvider(issuer, event);
  
  // Cache the provider
  providerCache.set(issuer, {
    provider,
    createdAt: Date.now(),
    issuer,
  });

  // Clean up old entries periodically
  cleanupExpiredProviders();

  return provider;
}

/**
 * Clear provider cache for a specific issuer
 */
export function clearProviderCache(issuer?: string): void {
  if (issuer) {
    providerCache.delete(issuer);
  } else {
    providerCache.clear();
  }
}

/**
 * Clean up expired providers from cache
 */
function cleanupExpiredProviders(): void {
  const now = Date.now();
  
  for (const [issuer, cached] of providerCache.entries()) {
    if ((now - cached.createdAt) >= CACHE_TTL) {
      providerCache.delete(issuer);
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: providerCache.size,
    entries: Array.from(providerCache.entries()).map(([issuer, cached]) => ({
      issuer,
      age: Date.now() - cached.createdAt,
      valid: (Date.now() - cached.createdAt) < CACHE_TTL,
    })),
  };
}