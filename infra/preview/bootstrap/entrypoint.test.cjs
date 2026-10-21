"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { bind, paths } = require("./entrypoint.cjs");
const env = { AWS_REGION: "eu-north-1", NODE_ENV: "production" };
function mock(change = (x) => x) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command.input);
      return change({
        Parameters: command.input.Names.map((Name) => ({
          Name,
          Type: "SecureString",
          Value: "disposable-unit-test-value",
        })),
      });
    },
  };
}
test("production cannot use the disposable fixture", async () => {
  await assert.rejects(
    bind("api", { ...env, PREVIEW_CI_FIXTURE: "true" }, mock()),
    /FixtureRequiresTestEnvironment/,
  );
});
test("migration and database initialization request only the database parameter", async () => {
  for (const mode of ["migrate", "prepare-db-secret"]) {
    const client = mock();
    await bind(mode, env, client);
    assert.deepEqual(client.calls, [
      { Names: [paths.DB_PASSWORD], WithDecryption: true },
    ]);
  }
});
test("closed rollout does not retrieve the OpenAI key", async () => {
  const client = mock();
  const value = await bind("api", env, client);
  assert.deepEqual(Object.keys(value), [
    "DB_PASSWORD",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ]);
  assert.ok(!client.calls[0].Names.includes(paths.OPENAI_API_KEY));
});
test("explicit AI enablement includes the existing key parameter", async () => {
  const client = mock();
  await bind("worker", { ...env, MVP_AI_ENABLED: "true" }, client);
  assert.ok(client.calls[0].Names.includes(paths.OPENAI_API_KEY));
});
test("missing, unencrypted and newline-bearing values fail closed", async () => {
  for (const change of [
    (x) => ({ InvalidParameters: [paths.DB_PASSWORD] }),
    (x) => ({ Parameters: [] }),
    (x) => {
      x.Parameters[0].Type = "String";
      return x;
    },
    (x) => {
      x.Parameters[0].Value = "invalid\nvalue";
      return x;
    },
  ])
    await assert.rejects(
      bind("migrate", env, mock(change)),
      /PreviewParameter/,
    );
});
test("unsupported region and mode fail before secret retrieval", async () => {
  const client = mock();
  await assert.rejects(
    bind("api", { ...env, AWS_REGION: "us-east-1" }, client),
    /PreviewRegionRequired/,
  );
  await assert.rejects(bind("unknown", env, client), /InvalidPreviewCommand/);
  assert.equal(client.calls.length, 0);
});
