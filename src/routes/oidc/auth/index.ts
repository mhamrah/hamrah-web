import type { RequestHandler } from '@builder.io/qwik-city';
import { getClient, validateRedirectUri } from '../../../lib/auth/client-manager';
import { generateToken } from '../../../lib/auth/tokens';
import { getRateLimitConfig, checkRateLimit, createRateLimitResponse } from '../../../lib/auth/security-config';

/**
 * OAuth 2.0 Authorization Endpoint
 * Handles authorization requests with PKCE support
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Rate limiting
    const rateLimitConfig = getRateLimitConfig('/oidc/auth', event);
    const rateLimit = await checkRateLimit(event, rateLimitConfig);
    
    if (!rateLimit.allowed) {
      event.send(createRateLimitResponse(rateLimit.resetTime));
      return;
    }

    // Extract parameters
    const params = event.url.searchParams;
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const responseType = params.get('response_type');
    const scope = params.get('scope');
    const state = params.get('state');
    const codeChallenge = params.get('code_challenge');
    const codeChallengeMethod = params.get('code_challenge_method');

    // Validate required parameters
    if (!clientId || !redirectUri || !responseType) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, response_type',
      });
      return;
    }

    // Validate response_type
    if (responseType !== 'code') {
      event.json(400, {
        error: 'unsupported_response_type',
        error_description: 'Only "code" response type is supported',
      });
      return;
    }

    // Validate client
    const client = await getClient(event, clientId);
    if (!client || !client.active) {
      event.json(400, {
        error: 'invalid_client',
        error_description: 'Invalid or inactive client',
      });
      return;
    }

    // Validate redirect URI
    const isValidRedirect = await validateRedirectUri(event, clientId, redirectUri);
    if (!isValidRedirect) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri',
      });
      return;
    }

    // Validate PKCE for native clients
    if (client.applicationType === 'native') {
      if (!codeChallenge || !codeChallengeMethod) {
        const errorUrl = new URL(redirectUri);
        errorUrl.searchParams.set('error', 'invalid_request');
        errorUrl.searchParams.set('error_description', 'PKCE required for native clients');
        if (state) errorUrl.searchParams.set('state', state);
        
        event.redirect(302, errorUrl.toString());
        return;
      }

      if (codeChallengeMethod !== 'S256') {
        const errorUrl = new URL(redirectUri);
        errorUrl.searchParams.set('error', 'invalid_request');
        errorUrl.searchParams.set('error_description', 'Only S256 code challenge method is supported');
        if (state) errorUrl.searchParams.set('state', state);
        
        event.redirect(302, errorUrl.toString());
        return;
      }
    }

    // Store authorization code with PKCE data (in a real implementation, this would go to a database/cache)
    // For now, we'll redirect to the interaction page
    
    // Create interaction URL
    const interactionId = generateToken();
    const interactionUrl = `/auth/oidc/interaction/${interactionId}?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope || 'openid',
      state: state || '',
      code_challenge: codeChallenge || '',
      code_challenge_method: codeChallengeMethod || '',
    }).toString();

    event.redirect(302, interactionUrl);

  } catch (error) {
    console.error('Authorization endpoint error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
};