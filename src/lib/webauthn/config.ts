// WebAuthn configuration that adapts to environment
// This ensures iOS app can properly authenticate in both development and production

export const getWebAuthnConfig = () => {
  // Check for development environment through various means
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       process.env.CLOUDFLARE_ENVIRONMENT === 'development' ||
                       (typeof globalThis !== 'undefined' && globalThis.location?.hostname === 'localhost');
  
  const RP_NAME = "Hamrah App";
  const RP_ID = isDevelopment ? "localhost" : "hamrah.app";
  const EXPECTED_ORIGIN = isDevelopment ? "https://localhost:5173" : "https://hamrah.app";

  console.log(`🔧 WebAuthn Config: isDevelopment=${isDevelopment}, RP_ID=${RP_ID}, EXPECTED_ORIGIN=${EXPECTED_ORIGIN}`);

  return {
    RP_NAME,
    RP_ID,
    EXPECTED_ORIGIN,
    isDevelopment
  };
};