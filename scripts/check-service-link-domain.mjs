import { pathToFileURL } from "node:url";

const servicePath = "/discover/service";
const fingerprintPattern = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i;

function publicOrigin(env) {
  const origin = new URL(env.ORZELL_PUBLIC_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.port ||
    origin.href !== origin.origin + "/"
  )
    throw Error("ORZELL_PUBLIC_ORIGIN must be a bare HTTPS origin");
  return origin;
}

async function manifest(origin, name, request) {
  const res = await request(new URL("/.well-known/" + name, origin), {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (
    res.status !== 200 ||
    res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
  )
    throw Error(
      name + " must respond directly with HTTP 200 and application/json",
    );
  return res.json();
}

export async function checkAppleServiceLinkDomain(env, request = fetch) {
  const origin = publicOrigin(env);
  const appId = env.ORZELL_IOS_APPLICATION_IDENTIFIER;
  if (!/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(appId ?? ""))
    throw Error("Expected a signed iOS application identifier");
  const apple = await manifest(origin, "apple-app-site-association", request);
  // Verify the explicit service-path declaration. OS rule order and installation
  // behaviour still require a signed device test.
  if (
    !apple?.applinks?.details?.some(
      (detail) =>
        Array.isArray(detail?.appIDs) &&
        detail.appIDs.includes(appId) &&
        detail.components?.some(
          (component) =>
            component?.["/"] === servicePath && component.exclude !== true,
        ),
    )
  )
    throw Error(
      "Missing explicit Apple service-path declaration for the expected app",
    );
}

export async function checkServiceLinkDomain(env, request = fetch) {
  const origin = publicOrigin(env);
  const pkg = env.ORZELL_ANDROID_APPLICATION_ID;
  const fingerprint = env.ORZELL_ANDROID_CERT_SHA256;
  if (
    !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(pkg ?? "") ||
    !fingerprintPattern.test(fingerprint ?? "")
  )
    throw Error(
      "Expected an Android application ID and SHA-256 signing fingerprint",
    );

  const [, android] = await Promise.all([
    checkAppleServiceLinkDomain(env, request),
    manifest(origin, "assetlinks.json", request),
  ]);
  if (
    !Array.isArray(android) ||
    !android.some(
      (statement) =>
        Array.isArray(statement?.relation) &&
        statement.relation.includes(
          "delegate_permission/common.handle_all_urls",
        ) &&
        statement.target?.namespace === "android_app" &&
        statement.target.package_name === pkg &&
        statement.target.sha256_cert_fingerprints?.some(
          (value) =>
            typeof value === "string" &&
            value.toUpperCase() === fingerprint.toUpperCase(),
        ),
    )
  )
    throw Error(
      "Missing Android link declaration for the expected package and signing certificate",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkServiceLinkDomain(process.env).then(
    () =>
      console.log(
        "Verified the expected service link declarations in both domain files.",
      ),
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
