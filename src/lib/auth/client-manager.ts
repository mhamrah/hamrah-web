import { getDB, oauthClients } from '../db';
import { eq } from 'drizzle-orm';
import type { RequestEventCommon } from '@builder.io/qwik-city';

export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;

export interface ClientRegistration {
  client_name: string;
  application_type: 'native' | 'web';
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scopes?: string[];
  require_auth_time?: boolean;
  default_max_age?: number;
}

export interface ClientResponse {
  client_id: string;
  client_secret?: string;
  client_name: string;
  application_type: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scopes: string[];
  require_auth_time: boolean;
  default_max_age?: number;
  created_at: Date;
}

/**
 * Generate a secure client ID
 */
function generateClientId(): string {
  const prefix = 'hamrah_';
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 20);
  return prefix + randomPart;
}

/**
 * Generate a secure client secret
 */
function generateClientSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate redirect URIs for security
 */
function validateRedirectUris(uris: string[], applicationType: string): string[] {
  const errors: string[] = [];

  for (const uri of uris) {
    try {
      const url = new URL(uri);
      
      if (applicationType === 'native') {
        // Native apps should use custom schemes or localhost
        if (url.protocol !== 'hamrah:' && 
            url.protocol !== 'http:' && 
            url.protocol !== 'https:') {
          errors.push(`Invalid redirect URI for native app: ${uri}`);
        }
        
        // If using http/https, must be localhost for native apps
        if ((url.protocol === 'http:' || url.protocol === 'https:') && 
            url.hostname !== 'localhost' && 
            url.hostname !== '127.0.0.1') {
          errors.push(`Native apps can only use localhost for http/https URIs: ${uri}`);
        }
      } else {
        // Web apps must use https in production
        if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
          errors.push(`Web apps must use HTTPS: ${uri}`);
        }
      }
    } catch (error) {
      errors.push(`Invalid URI format: ${uri}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  return uris;
}

/**
 * Register a new OAuth client
 */
export async function registerClient(
  event: RequestEventCommon,
  registration: ClientRegistration
): Promise<ClientResponse> {
  const db = getDB(event);
  const now = new Date();
  
  // Validate input
  if (!registration.client_name || registration.client_name.trim().length === 0) {
    throw new Error('Client name is required');
  }

  if (!registration.redirect_uris || registration.redirect_uris.length === 0) {
    throw new Error('At least one redirect URI is required');
  }

  // Validate redirect URIs
  const validatedUris = validateRedirectUris(
    registration.redirect_uris, 
    registration.application_type
  );

  // Set defaults based on application type
  const grantTypes = registration.grant_types || 
    (registration.application_type === 'native' 
      ? ['authorization_code', 'refresh_token']
      : ['authorization_code', 'refresh_token', 'client_credentials']);

  const responseTypes = registration.response_types || ['code'];
  
  const tokenEndpointAuthMethod = registration.token_endpoint_auth_method ||
    (registration.application_type === 'native' ? 'none' : 'client_secret_basic');

  const scopes = registration.scopes || ['openid', 'profile', 'email'];

  // Generate client credentials
  const clientId = generateClientId();
  const clientSecret = tokenEndpointAuthMethod !== 'none' ? generateClientSecret() : null;

  // Create client record
  const clientData: NewOAuthClient = {
    id: clientId,
    clientId,
    clientSecret,
    clientName: registration.client_name.trim(),
    applicationType: registration.application_type,
    redirectUris: JSON.stringify(validatedUris),
    grantTypes: JSON.stringify(grantTypes),
    responseTypes: JSON.stringify(responseTypes),
    tokenEndpointAuthMethod,
    scopes: JSON.stringify(scopes),
    requireAuthTime: registration.require_auth_time || false,
    defaultMaxAge: registration.default_max_age,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(oauthClients).values(clientData);

  return {
    client_id: clientId,
    client_secret: clientSecret || undefined,
    client_name: registration.client_name,
    application_type: registration.application_type,
    redirect_uris: validatedUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scopes,
    require_auth_time: registration.require_auth_time || false,
    default_max_age: registration.default_max_age,
    created_at: now,
  };
}

/**
 * Get client by client ID
 */
export async function getClient(
  event: RequestEventCommon,
  clientId: string
): Promise<OAuthClient | null> {
  const db = getDB(event);
  
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId));

  return client || null;
}

/**
 * Get all active clients
 */
export async function getAllClients(
  event: RequestEventCommon
): Promise<OAuthClient[]> {
  const db = getDB(event);
  
  return await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.active, true));
}

/**
 * Deactivate a client
 */
export async function deactivateClient(
  event: RequestEventCommon,
  clientId: string
): Promise<boolean> {
  const db = getDB(event);
  
  const result = await db
    .update(oauthClients)
    .set({ 
      active: false, 
      updatedAt: new Date() 
    })
    .where(eq(oauthClients.clientId, clientId));

  return result.meta.changes > 0;
}

/**
 * Validate client credentials
 */
export async function validateClientCredentials(
  event: RequestEventCommon,
  clientId: string,
  clientSecret?: string
): Promise<boolean> {
  const client = await getClient(event, clientId);
  
  if (!client || !client.active) {
    return false;
  }

  // Public clients (no secret required)
  if (client.tokenEndpointAuthMethod === 'none') {
    return !clientSecret; // Should not provide secret for public clients
  }

  // Confidential clients (secret required)
  return client.clientSecret === clientSecret;
}

/**
 * Check if redirect URI is valid for client
 */
export async function validateRedirectUri(
  event: RequestEventCommon,
  clientId: string,
  redirectUri: string
): Promise<boolean> {
  const client = await getClient(event, clientId);
  
  if (!client || !client.active) {
    return false;
  }

  const allowedUris = JSON.parse(client.redirectUris) as string[];
  return allowedUris.includes(redirectUri);
}

/**
 * Convert database client to OIDC provider format
 */
export function clientToOIDCFormat(client: OAuthClient): any {
  return {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    client_name: client.clientName,
    redirect_uris: JSON.parse(client.redirectUris),
    grant_types: JSON.parse(client.grantTypes),
    response_types: JSON.parse(client.responseTypes),
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    application_type: client.applicationType,
    require_auth_time: client.requireAuthTime,
    default_max_age: client.defaultMaxAge,
  };
}