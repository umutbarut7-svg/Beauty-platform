/* global module, process, URL */
// Expo merges the checked-in app.json before invoking this build-time config.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_ORZELL_NATIVE_SERVICE_LINKS_ENABLED !== "true")
    return config;
  if (process.env.EXPO_PUBLIC_ORZELL_EVERYWHERE_ENABLED !== "true")
    throw new Error("Native service links require ORZELL Everywhere.");
  const origin = new URL(process.env.EXPO_PUBLIC_ORZELL_WEB_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.href !== origin.origin + "/" ||
    origin.port
  )
    throw new Error("Native service links require a bare HTTPS domain.");
  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: [
        ...(config.ios?.associatedDomains ?? []),
        "applinks:" + origin.hostname,
      ],
    },
    android: {
      ...config.android,
      intentFilters: [
        ...(config.android?.intentFilters ?? []),
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            {
              scheme: "https",
              host: origin.hostname,
              path: "/discover/service",
            },
          ],
        },
      ],
    },
  };
};
