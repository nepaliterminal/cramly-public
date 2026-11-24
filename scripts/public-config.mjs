import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const fields = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID",
};

export function publicConfig(env) {
  const firebase = Object.fromEntries(
    Object.entries(fields).map(([field, variable]) => [
      field,
      String(env[variable] || "").trim(),
    ]),
  );
  const hostingSettingsUrl = String(
    env.VITE_CRAMLY_HOSTING_SETTINGS_URL || "",
  ).trim();
  if (hostingSettingsUrl) {
    const url = new URL(hostingSettingsUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "Hosting settings URL must use HTTPS without embedded credentials.",
      );
  }
  return { firebase, hostingSettingsUrl };
}

export async function writePublicConfig(
  directory,
  config,
  mode = "production",
) {
  const script =
    "globalThis.CRAMLY_CONFIG = " +
    JSON.stringify(config).replaceAll("<", "\\u003c") +
    ";\n";
  for (const folder of mode === "development"
    ? ["public"]
    : ["docs", "public"]) {
    await mkdir(resolve(directory, folder), { recursive: true });
    await writeFile(resolve(directory, folder, "runtime-config.js"), script);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const directory = process.cwd();
  const mode = process.argv[2] || "production";
  const env = loadEnv(mode, directory, "VITE_");
  await writePublicConfig(directory, publicConfig(env), mode);
}
