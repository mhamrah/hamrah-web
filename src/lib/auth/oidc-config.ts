import { Provider } from 'oidc-provider';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { getDB, users, authTokens, oauthClients } from '../db';
import { eq } from 'drizzle-orm';
import { getAllClients, clientToOIDCFormat } from './client-manager';
import { getOrGenerateJWKS } from './key-manager';

/**
 * Get cookie secret with production validation
 */
function getCookieSecret(event: RequestEventCommon): string {
  const secret = event.platform?.env?.AUTH_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET environment variable is required in production');
    }
    console.warn('AUTH_SECRET not set, using development default');
    return 'dev-cookie-secret-not-for-production';
  }
  
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters long');
  }
  
  return secret;
}

// OIDC Configuration for mobile authentication
export interface OIDCConfig {
  issuer: string;
  jwks: any;
  clients: OIDCClient[];
}

export interface OIDCClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  application_type: 'native' | 'web';
  require_auth_time?: boolean;
  default_max_age?: number;
}

// Default clients - iOS mobile app
const DEFAULT_CLIENTS: OIDCClient[] = [
  {
    client_id: 'hamrah-ios-app',
    client_name: 'Hamrah iOS Application',
    redirect_uris: ['hamrah://auth/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // Public client - no secret
    application_type: 'native',
    require_auth_time: true,
    default_max_age: 3600, // 1 hour
  },
];

/**
 * Generate or retrieve JWKS for token signing
 * @deprecated Use getOrGenerateJWKS from key-manager instead
 */
export async function generateJWKS() {
  throw new Error('generateJWKS is deprecated. Use getOrGenerateJWKS from key-manager instead.');
}

/**
 * Create OIDC Provider instance
 */
export async function createOIDCProvider(issuer: string, event: RequestEventCommon) {
  const jwksData = await getOrGenerateJWKS(event);
  
  // Create JWKS with private key for signing
  const jwks = {
    keys: jwksData.privateKeyJWK ? [
      // Private key for signing (includes both public and private components)
      {
        ...jwksData.privateKeyJWK,
        use: 'sig',
        alg: 'RS256',
        kid: jwksData.keys[0]?.kid,
      }
    ] : [],
  };

  // Load clients from database
  const dbClients = await getAllClients(event);
  const clients = dbClients.map(clientToOIDCFormat) as any[];

  // Account adapter for user lookup and authentication
  const Account = {
    findAccount: async (ctx: any, id: string) => {
      const db = getDB(event);
      const [user] = await db.select().from(users).where(eq(users.id, id));

      if (!user) return undefined;

      return {
        accountId: user.id,
        claims: async (use: string, scope: string, claims: any, rejected: any) => {
          const profile: Record<string, any> = {
            sub: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            email_verified: true, // Assuming verified since we only allow OAuth logins
          };

          // Return claims based on requested scopes
          if (scope?.includes('profile')) {
            return {
              sub: profile.sub,
              name: profile.name,
              picture: profile.picture,
            };
          }

          if (scope?.includes('email')) {
            return {
              sub: profile.sub,
              email: profile.email,
              email_verified: profile.email_verified,
            };
          }

          return { sub: profile.sub };
        },
      };
    },
  };

  const provider = new Provider(issuer, {
    // Client configurations from database
    clients,

    // Account lookup adapter
    findAccount: Account.findAccount,

    // Security features
    features: {

      // Device authorization flow for mobile scenarios
      deviceFlow: { enabled: true },

      // Token revocation for logout
      revocation: { enabled: true },

      // JWT access tokens for stateless validation (commented out due to type issues)
      // jwtAccessTokens: { enabled: true },

      // Introspection for token validation
      introspection: { enabled: true },

      // Enable DPoP for enhanced security (optional)
      dPoP: { enabled: false }, // Can be enabled for additional security
    },

    // JSON Web Key Set
    jwks,

    // Token time-to-live configuration
    ttl: {
      AccessToken: 3600, // 1 hour
      RefreshToken: 86400 * 7, // 1 week
      IdToken: 3600, // 1 hour
      AuthorizationCode: 600, // 10 minutes
      Interaction: 3600, // 1 hour for user interaction
      Session: 86400, // 1 day
    },

    // Supported claims
    claims: {
      profile: ['name', 'given_name', 'family_name', 'picture'],
      email: ['email', 'email_verified'],
      openid: ['sub'],
    },

    // Supported scopes
    scopes: ['openid', 'profile', 'email'],

    // Response types
    responseTypes: ['code', 'id_token', 'code id_token'],

    // Grant types (commented out due to type issues)
    // grantTypes: ['authorization_code', 'refresh_token'],

    // Subject types
    subjectTypes: ['public'],

    // Token endpoint authentication methods (commented out due to type issues)
    // tokenEndpointAuthMethods: ['none', 'client_secret_basic', 'client_secret_post'],

    // CORS settings for mobile apps (commented out due to type issues)
    // cors: {
    //   origin: (ctx: any) => {
    //     // Allow requests from mobile app and localhost for development
    //     const origin = ctx.request.headers.origin;
    //     if (!origin) return false;
    //     
    //     // Allow localhost for development
    //     if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    //       return true;
    //     }
    //     
    //     // Allow your app's custom scheme
    //     if (origin.startsWith('hamrah://')) {
    //       return true;
    //     }
    //     
    //     return false;
    //   },
    //   credentials: true,
    // },

    // Custom interaction handling for login/consent
    interactions: {
      url: (ctx: any, interaction: any) => {
        // Redirect to your app's login page
        return `/auth/oidc/interaction/${interaction.uid}`;
      },
    },

    // Security configurations
    conformIdTokenClaims: false, // Set to true for strict OIDC compliance
    renderError: async (ctx: any, out: any, error: any) => {
      // Custom error handling
      ctx.type = 'application/json';
      ctx.body = {
        error: error.error,
        error_description: error.error_description,
      };
    },

    // Security policies
    cookies: {
      keys: [getCookieSecret(event)],
      long: {
        signed: true,
        secure: true, // HTTPS only in production
        httpOnly: true,
        sameSite: 'none', // Required for mobile apps
      } as any,
      short: {
        signed: true,
        secure: true,
        httpOnly: true,
        sameSite: 'none',
      } as any,
    },
  });

  // Event listeners for logging and monitoring
  provider.on('authorization.success' as any, (ctx: any) => {
    console.log('Authorization successful:', {
      client_id: ctx.oidc.client?.clientId,
      user_id: ctx.oidc.session?.accountId,
      timestamp: new Date().toISOString(),
    });
  });

  provider.on('authorization.error' as any, (ctx: any, error: any) => {
    console.error('Authorization error:', {
      error: error.message,
      client_id: ctx.oidc.client?.clientId,
      timestamp: new Date().toISOString(),
    });
  });

  return provider;
}

/**
 * Validate if a client is allowed to access the API
 */
export function isValidMobileClient(clientId: string): boolean {
  return DEFAULT_CLIENTS.some(client => client.client_id === clientId);
}

/**
 * Get client configuration
 */
export function getMobileClient(clientId: string): OIDCClient | undefined {
  return DEFAULT_CLIENTS.find(client => client.client_id === clientId);
}