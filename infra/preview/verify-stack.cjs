"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const args = [
  "compose",
  "-f",
  "infra/preview/compose.yml",
  "-f",
  "infra/preview/compose.ci.yml",
];
const compose = (...rest) =>
  execFileSync("docker", [...args, ...rest], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const base = "http://127.0.0.1:8080";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(base + "/api/health/ready", {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) return;
      await r.body?.cancel();
    } catch {}
    await pause(2000);
  }
  throw new Error("Preview readiness timeout");
}
async function post(path, data, expected) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(r.status, expected, `${path} status`);
  return r.json();
}
async function main() {
  assert.equal(process.env.PREVIEW_CI_FIXTURE, "true");
  assert.equal(process.env.PREVIEW_NODE_ENV, "test");
  await ready();
  for (const path of ["/", "/operator/"]) {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<html/i);
  }
  console.log("PASS: gateway serves web, operator and migrated API");
  const user = {
    email: `preview-${Date.now()}@example.test`,
    password: "disposable-preview-password-123",
  };
  const registered = await post("/api/auth/register", user, 201);
  assert.ok(registered.accessToken);
  assert.ok(!registered.user.passwordHash);
  const login = await post("/api/auth/login", user, 201);
  assert.equal(login.user.id, registered.user.id);
  const r = await fetch(base + "/api/mvp/v1/capabilities", {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(r.status, 200);
  const caps = await r.json();
  assert.equal(caps.enabled, false);
  console.log("PASS: real registration/login with rollout closed");
  compose("stop", "gateway", "api", "worker", "postgres");
  compose("run", "--rm", "--no-deps", "prepare-secrets");
  compose("up", "-d");
  await ready();
  const relogin = await post("/api/auth/login", user, 201);
  assert.equal(relogin.user.id, registered.user.id);
  console.log(
    "PASS: database survives service restart and tmpfs secret can be initialized again",
  );
  for (const service of ["api", "worker", "postgres", "admin", "gateway"]) {
    const id = compose("ps", "-q", service).trim();
    assert.ok(id, service);
    const state = JSON.parse(
      execFileSync("docker", ["inspect", "--format", "{{json .State}}", id], {
        encoding: "utf8",
      }),
    );
    assert.equal(state.Running, true, service);
    assert.equal(state.OOMKilled, false, service);
  }
  console.log(
    "PASS: all five runtime containers running within configured memory caps",
  );
}
main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
