"use strict";
const { spawn } = require("node:child_process");
const { mkdir, writeFile, chmod } = require("node:fs/promises");
const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");

const paths = {
  DB_PASSWORD: "/beauty-platform/preview/database-password",
  JWT_ACCESS_SECRET: "/beauty-platform/preview/jwt-access-secret",
  JWT_REFRESH_SECRET: "/beauty-platform/preview/jwt-refresh-secret",
  OPENAI_API_KEY: "/beauty-platform/dev/openai-api-key",
};
async function bind(mode, environment, client) {
  if (!["api", "worker", "migrate", "prepare-db-secret"].includes(mode))
    throw new Error("InvalidPreviewCommand");
  if (environment.PREVIEW_CI_FIXTURE === "true") {
    if (environment.NODE_ENV !== "test")
      throw new Error("FixtureRequiresTestEnvironment");
    return {
      DB_PASSWORD: "disposable-ci-only-password",
      JWT_ACCESS_SECRET: "disposable-preview-access-secret-not-for-deployment",
      JWT_REFRESH_SECRET:
        "disposable-preview-refresh-secret-not-for-deployment",
    };
  }
  if (environment.AWS_REGION !== "eu-north-1")
    throw new Error("PreviewRegionRequired");
  const names = ["DB_PASSWORD"];
  if (["api", "worker"].includes(mode))
    names.push("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET");
  if (environment.MVP_AI_ENABLED === "true" && ["api", "worker"].includes(mode))
    names.push("OPENAI_API_KEY");
  const reply = await client.send(
    new GetParametersCommand({
      Names: names.map((name) => paths[name]),
      WithDecryption: true,
    }),
  );
  if (reply.InvalidParameters?.length)
    throw new Error("MissingPreviewParameter");
  const values = {};
  for (const name of names) {
    const parameter = reply.Parameters?.find(
      (item) => item.Name === paths[name],
    );
    if (
      parameter?.Type !== "SecureString" ||
      !parameter.Value ||
      /[\r\n]/.test(parameter.Value)
    )
      throw new Error("InvalidPreviewParameter");
    values[name] = parameter.Value;
  }
  return values;
}
async function main() {
  const mode = process.argv[2];
  const client = new SSMClient({
    region: process.env.AWS_REGION,
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
  });
  let values;
  try {
    values = await bind(mode, process.env, client);
  } finally {
    client.destroy();
  }
  if (mode === "prepare-db-secret") {
    // The only file is a DB password on a dedicated shared tmpfs volume.
    // The OpenAI key and JWT secrets are never written to files.
    await mkdir("/preview-secrets", { recursive: true });
    await chmod("/preview-secrets/postgres-password", 0o600).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile("/preview-secrets/postgres-password", values.DB_PASSWORD, {
      mode: 0o600,
    });
    await chmod("/preview-secrets/postgres-password", 0o444);
    return;
  }
  if (
    !["postgres", "127.0.0.1", "localhost"].includes(
      process.env.DB_HOST ?? "postgres",
    )
  )
    throw new Error("PreviewDatabaseHostInvalid");
  const environment = {
    ...process.env,
    ...values,
    DATABASE_URL: `postgresql://beauty:${encodeURIComponent(values.DB_PASSWORD)}@${process.env.DB_HOST ?? "postgres"}:5432/beauty_preview?schema=public`,
  };
  delete environment.DB_PASSWORD;
  const command =
    mode === "migrate"
      ? ["node_modules/prisma/build/index.js", "migrate", "deploy"]
      : [
          mode === "worker" ? "dist/worker.js" : "dist/main.js",
          ...(mode === "worker" && process.env.STAGE33_MVP_ENABLED !== "true"
            ? ["--privacy-cleanup"]
            : []),
        ];
  const child = spawn(process.execPath, command, {
    env: environment,
    stdio: "inherit",
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => child.kill(signal));
  child.once("error", () => {
    console.error("Preview process could not start");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}
module.exports = { bind, paths };
if (require.main === module)
  main().catch(() => {
    console.error("Preview secret binding or startup failed");
    process.exitCode = 1;
  });
