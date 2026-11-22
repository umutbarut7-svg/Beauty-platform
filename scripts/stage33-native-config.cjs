// Only ephemeral native validation uses this namespace; it is not a store identity.
const fs = require("node:fs");
if (process.env.CI !== "true")
  throw new Error("Native fixture configuration requires CI");
const path = "apps/mobile/app.json";
const config = JSON.parse(fs.readFileSync(path, "utf8"));
config.expo.android = {
  ...config.expo.android,
  package: "com.beautyplatform.stage33test",
};
config.expo.ios = {
  ...config.expo.ios,
  bundleIdentifier: "com.beautyplatform.stage33test",
};
fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
