import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicConfig, writePublicConfig } from "../scripts/public-config.mjs";

test("public runtime configuration includes only owner-configured public fields, never server secrets", () => {
  const config = publicConfig({
    VITE_FIREBASE_PROJECT_ID: "test-owner-project",
    VITE_FIREBASE_API_KEY: "test-public-firebase-key",
    VITE_CRAMLY_HOSTING_SETTINGS_URL: "https://example.com/settings",
    CRAMLY_SITE_PASSWORD: "test-only-site-secret",
    CRAMLY_ADMIN_PASSWORD: "test-only-admin-secret",
    CRAMLY_SESSION_SECRET: "test-only-signing-secret",
    VITE_UNRELATED_SECRET: "test-only-unrelated-value",
  });
  assert.equal(config.firebase.projectId, "test-owner-project");
  assert.equal(config.firebase.apiKey, "test-public-firebase-key");
  assert.equal(config.hostingSettingsUrl, "https://example.com/settings");
  assert.doesNotMatch(
    JSON.stringify(config),
    /test-only|PASSWORD|SESSION_SECRET/,
  );
});

test("an unconfigured source copy has no Firebase project or owner hosting destination", () => {
  const config = publicConfig({});
  assert.ok(Object.values(config.firebase).every((value) => value === ""));
  assert.equal(config.hostingSettingsUrl, "");
});

test("starting development cannot replace the classic production configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cramly-config-modes-"));
  try {
    const production = publicConfig({
      VITE_FIREBASE_PROJECT_ID: "production-fixture",
    });
    const development = publicConfig({
      VITE_FIREBASE_PROJECT_ID: "development-fixture",
    });
    await writePublicConfig(directory, production);
    const original = await readFile(
      join(directory, "docs/runtime-config.js"),
      "utf8",
    );
    await writePublicConfig(directory, development, "development");
    assert.equal(
      await readFile(join(directory, "docs/runtime-config.js"), "utf8"),
      original,
    );
    assert.match(
      await readFile(join(directory, "public/runtime-config.js"), "utf8"),
      /development-fixture/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("hosting settings links cannot contain credentials or executable protocols", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://user:password@example.com",
    "http://example.com",
  ])
    assert.throws(
      () => publicConfig({ VITE_CRAMLY_HOSTING_SETTINGS_URL: value }),
      /HTTPS/,
    );
});

test("classic and workspace builds receive identical safely serialized runtime settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cramly-public-config-"));
  try {
    const config = publicConfig({ VITE_FIREBASE_PROJECT_ID: "</script>" });
    await writePublicConfig(directory, config);
    const classic = await readFile(
      join(directory, "docs/runtime-config.js"),
      "utf8",
    );
    const workspace = await readFile(
      join(directory, "public/runtime-config.js"),
      "utf8",
    );
    assert.equal(classic, workspace);
    assert.doesNotMatch(classic, /<\/script>/);
    const parsed = JSON.parse(
      classic.slice("globalThis.CRAMLY_CONFIG = ".length, -2),
    );
    assert.deepEqual(parsed, config);
  } finally {
    await rm(directory, { recursive: true });
  }
});
