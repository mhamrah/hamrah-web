import { Provider } from 'oidc-provider';
import { generateKeyPair, exportJWK, importPKCS8, importSPKI } from 'jose';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { getDB, users, authTokens, oauthClients } from '../db';
import { eq } from 'drizzle-orm';
import { getAllClients, clientToOIDCFormat } from './client-manager';

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
 */
export async function generateJWKS() {
  // In production, you should store these keys securely and rotate them
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
  });

  const publicJWK = await exportJWK(publicKey);
  const privateJWK = await exportJWK(privateKey);

  return {
    keys: [
      {
        ...publicJWK,
        kid: 'main-signing-key',
        use: 'sig',
        alg: 'RS256',
      },
    ],
    privateKey: privateJWK,
  };
}

/**
 * Create OIDC Provider instance
 */
export async function createOIDCProvider(issuer: string, event: RequestEventCommon) {
  const jwks = await generateJWKS();

  // Load clients from database
  const dbClients = await getAllClients(event);
  const clients = dbClients.map(clientToOIDCFormat);

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
      // PKCE is required for mobile apps
      pkce: {
        required: (ctx: any, client: any) => {
          return client.applicationType === 'native';
        },
        methods: ['S256'], // Only allow SHA256 challenge method
      },

      // Device authorization flow for mobile scenarios
      deviceFlow: { enabled: true },

      // Token revocation for logout
      revocation: { enabled: true },

      // JWT access tokens for stateless validation
      jwtAccessTokens: { enabled: true },

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

    // Grant types
    grantTypes: ['authorization_code', 'refresh_token'],

    // Subject types
    subjectTypes: ['public'],

    // Token endpoint authentication methods
    tokenEndpointAuthMethods: ['none', 'client_secret_basic', 'client_secret_post'],

    // CORS settings for mobile apps
    cors: {
      origin: (ctx: any) => {
        // Allow requests from mobile app and localhost for development
        const origin = ctx.request.headers.origin;
        if (!origin) return false;
        
        // Allow localhost for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return true;
        }
        
        // Allow your app's custom scheme
        if (origin.startsWith('hamrah://')) {
          return true;
        }
        
        return false;
      },
      credentials: true,
    },

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
      keys: [process.env.COOKIE_SECRET || 'default-cookie-secret-change-in-production'],
      long: {
        signed: true,
        secure: true, // HTTPS only in production
        httpOnly: true,
        maxAge: 86400000, // 1 day
        sameSite: 'none', // Required for mobile apps
      },
      short: {
        signed: true,
        secure: true,
        httpOnly: true,
        maxAge: 600000, // 10 minutes
        sameSite: 'none',
      },
    },
  });

  // Event listeners for logging and monitoring
  provider.on('authorization.success', (ctx: any) => {
    console.log('Authorization successful:', {
      client_id: ctx.oidc.client?.clientId,
      user_id: ctx.oidc.session?.accountId,
      timestamp: new Date().toISOString(),
    });
  });

  provider.on('authorization.error', (ctx: any, error: any) => {
    console.error('Authorization error:', {
      error: error.message,
      client_id: ctx.oidc.client?.clientId,
      timestamp: new Date().toISOString(),
    });
  });

  provider.on('token.issued', (ctx: any) => {
    console.log('Token issued:', {
      client_id: ctx.oidc.client?.clientId,
      user_id: ctx.oidc.session?.accountId,
      token_type: ctx.oidc.params?.grant_type,
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