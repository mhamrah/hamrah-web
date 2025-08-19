import type { RequestHandler } from "@builder.io/qwik-city";

export const onGet: RequestHandler = async (event) => {
  const envKeys = Object.keys(event.platform.env);
  const hasGoogle = {
    clientId: !!(event.platform.env as any).GOOGLE_CLIENT_ID,
    clientSecret: !!(event.platform.env as any).GOOGLE_CLIENT_SECRET,
  };

  console.log("Environment test:");
  console.log("Available env keys:", envKeys);
  console.log("Google credentials:", hasGoogle);
  console.log("Platform available:", !!event.platform);

  const responseData = {
    envKeys,
    hasGoogle,
    hasPlatform: !!event.platform,
    origin: event.url.origin,
  };

  event.json(200, responseData);
};
