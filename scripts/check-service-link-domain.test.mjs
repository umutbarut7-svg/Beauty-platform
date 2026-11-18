import test from "node:test";
import assert from "node:assert/strict";
import { checkServiceLinkDomain } from "./check-service-link-domain.mjs";

const env = {
  ORZELL_PUBLIC_ORIGIN: "https://share.example.test",
  ORZELL_IOS_APPLICATION_IDENTIFIER: "TESTTEAM01.test.orzell",
  ORZELL_ANDROID_APPLICATION_ID: "test.orzell",
  ORZELL_ANDROID_CERT_SHA256: Array(32).fill("AF").join(":"),
};
function fixture({
  path = "/discover/service",
  cert = env.ORZELL_ANDROID_CERT_SHA256,
  status = 200,
  exclude = false,
} = {}) {
  return (url, options) => {
    assert.equal(url.origin, env.ORZELL_PUBLIC_ORIGIN);
    assert.equal(options.redirect, "error");
    const bodies = {
      "/.well-known/apple-app-site-association": {
        applinks: {
          details: [
            {
              appIDs: [env.ORZELL_IOS_APPLICATION_IDENTIFIER],
              components: [{ "/": path, exclude }],
            },
          ],
        },
      },
      "/.well-known/assetlinks.json": [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: env.ORZELL_ANDROID_APPLICATION_ID,
            sha256_cert_fingerprints: [cert],
          },
        },
      ],
    };
    assert.ok(Object.hasOwn(bodies, url.pathname));
    return Response.json(bodies[url.pathname], { status });
  };
}
test("both domain declarations match the intended apps", () =>
  checkServiceLinkDomain(env, fixture()));
test("rejects unrelated paths, exclusions, mismatched certificates and redirects", async () => {
  for (const options of [
    { path: "/login" },
    { exclude: true },
    { cert: "wrong" },
    { status: 302 },
  ])
    await assert.rejects(checkServiceLinkDomain(env, fixture(options)));
});
