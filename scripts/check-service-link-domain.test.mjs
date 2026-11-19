import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAppleServiceLinkDomain,
  checkServiceLinkDomain,
} from "./check-service-link-domain.mjs";

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

test("iOS release checks only its own declaration", async () => {
  const ios = {
    ORZELL_PUBLIC_ORIGIN: env.ORZELL_PUBLIC_ORIGIN,
    ORZELL_IOS_APPLICATION_IDENTIFIER: env.ORZELL_IOS_APPLICATION_IDENTIFIER,
  };
  await checkAppleServiceLinkDomain(ios, (url, options) => {
    assert.equal(url.pathname, "/.well-known/apple-app-site-association");
    return fixture()(url, options);
  });
  await assert.rejects(
    checkAppleServiceLinkDomain(ios, fixture({ exclude: true })),
  );
});
