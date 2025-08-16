import { component$ } from '@builder.io/qwik';
import { routeLoader$, Form, routeAction$ } from '@builder.io/qwik-city';
import { createOIDCProvider } from '../../../../../lib/auth/oidc-config';
import { validateAccessToken } from '../../../../../lib/auth/tokens';

/**
 * Load interaction details from OIDC provider
 */
export const useInteractionLoader = routeLoader$(async ({ params, request, platform, url }) => {
  try {
    const issuer = `${url.protocol}//${url.host}/oidc`;
    const provider = await createOIDCProvider(issuer, { 
      request, 
      platform, 
      url 
    } as any);

    // Get interaction details
    const interactionDetails = await provider.interactionDetails(request as any, {
      headers: new Headers(),
      status: 200,
      set: () => {},
      get: () => null,
    } as any);

    return {
      uid: params.uid,
      interaction: {
        prompt: interactionDetails.prompt,
        params: interactionDetails.params,
        client: {
          clientId: interactionDetails.params.client_id,
          clientName: interactionDetails.client?.clientName || 'Hamrah iOS App',
        },
        grantId: interactionDetails.grantId,
      },
    };
  } catch (error) {
    console.error('Failed to load interaction:', error);
    throw new Error('Invalid interaction');
  }
});

/**
 * Handle user consent/authentication
 */
export const useInteractionAction = routeAction$(async (data, { request, platform, url, redirect }) => {
  try {
    const issuer = `${url.protocol}//${url.host}/oidc`;
    const provider = await createOIDCProvider(issuer, { 
      request, 
      platform, 
      url 
    } as any);

    // Get interaction details
    const interactionDetails = await provider.interactionDetails(request as any, {
      headers: new Headers(),
      status: 200,
      set: () => {},
      get: () => null,
    } as any);

    // Check if user is authenticated by looking for access token
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace('Bearer ', '') || 
                       request.headers.get('x-access-token') ||
                       data.access_token as string;

    let userId: string | null = null;

    if (accessToken) {
      // Validate existing access token
      const tokenValidation = await validateAccessToken({ 
        request, 
        platform, 
        url 
      } as any, accessToken);
      
      if (tokenValidation.isValid && tokenValidation.user) {
        userId = tokenValidation.user.id;
      }
    }

    if (!userId) {
      // User needs to authenticate first
      throw redirect(302, `/auth/login?return_to=${encodeURIComponent(request.url)}`);
    }

    // Handle different interaction prompts
    const result: any = {};

    if (interactionDetails.prompt.details.some((detail: any) => detail.prompt === 'login')) {
      // Login interaction
      result.login = {
        accountId: userId,
        remember: true,
        ts: Math.floor(Date.now() / 1000),
      };
    }

    if (interactionDetails.prompt.details.some((detail: any) => detail.prompt === 'consent')) {
      // Consent interaction - auto-approve for mobile app
      const scopes = interactionDetails.params.scope?.split(' ') || [];
      
      result.consent = {
        grantId: interactionDetails.grantId,
        rejectedScopes: [],
        rejectedClaims: [],
      };

      // Grant requested scopes for mobile app
      if (scopes.includes('openid')) {
        result.consent.grantedScopes = scopes;
      }
    }

    // Finish the interaction
    const response = {
      headers: new Headers(),
      status: 200,
      redirect: (url: string) => {
        throw redirect(302, url);
      },
      set: () => {},
      get: () => null,
    };

    await provider.interactionFinished(
      request as any, 
      response as any, 
      result
    );

    return { success: true };

  } catch (error) {
    if (error instanceof Error && error.message.includes('redirect')) {
      throw error; // Re-throw redirect errors
    }
    
    console.error('Interaction error:', error);
    return { 
      success: false, 
      error: 'Authentication failed' 
    };
  }
});

/**
 * OIDC Interaction UI Component
 */
export default component$(() => {
  const interaction = useInteractionLoader();
  const action = useInteractionAction();

  return (
    <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Authorize Application
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          {interaction.value.interaction.client.clientName} wants to access your account
        </p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {action.value?.error && (
            <div class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {action.value.error}
            </div>
          )}

          <div class="space-y-6">
            <div>
              <h3 class="text-lg font-medium text-gray-900">
                Requested Permissions
              </h3>
              <ul class="mt-2 text-sm text-gray-600 space-y-1">
                <li>• Access your profile information</li>
                <li>• View your email address</li>
                <li>• Maintain your login session</li>
              </ul>
            </div>

            <Form action={action}>
              <input 
                type="hidden" 
                name="uid" 
                value={interaction.value.uid} 
              />
              
              <div class="flex space-x-4">
                <button
                  type="submit"
                  class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Authorize
                </button>
                
                <button
                  type="button"
                  class="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md font-medium hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  onClick$={() => {
                    // Handle deny - redirect back to client with error
                    window.location.href = '/auth/login?error=access_denied';
                  }}
                >
                  Deny
                </button>
              </div>
            </Form>

            <div class="text-xs text-gray-500 text-center">
              By authorizing, you allow this app to access the permissions listed above.
              You can revoke access at any time from your account settings.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});