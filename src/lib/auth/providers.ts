import { Google, Apple } from "arctic";

export function getGoogleProvider(event: any) {
  const clientId =  event.platform.env.GOOGLE_CLIENT_ID;
  const clientSecret = event.platform.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${event.url.origin}/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new Google(clientId, clientSecret, redirectUri);
}

export function getAppleProvider(event: any) {
  const clientId = event.platform.env.APPLE_CLIENT_ID;
  const teamId = event.platform.env.APPLE_TEAM_ID;
  const keyId = event.platform.env.APPLE_KEY_ID;
  const certificate = event.platform.env.APPLE_CERTIFICATE; // Private key
  const redirectUri = `${event.url.origin}/auth/apple/callback`;

  if (!clientId || !teamId || !keyId || !certificate) {
    throw new Error("Apple OAuth credentials not configured");
  }

  // Convert PEM string to Uint8Array as required by Arctic
  // Remove PEM headers and decode base64 content
  const privateKeyBase64 = certificate
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll("\r", "")
    .replaceAll("\n", "")
    .trim();
  
  // Decode base64 to Uint8Array
  const privateKeyUint8Array = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));

  return new Apple(clientId, teamId, keyId, privateKeyUint8Array, redirectUri);
}
