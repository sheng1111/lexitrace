import { readFile, writeFile } from "node:fs/promises";

const templatePath = new URL("../config/manifest.template.json", import.meta.url);
const outputPath = new URL("../public/manifest.json", import.meta.url);
const envPath = new URL("../.env", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const placeholder = "__REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID__";
const versionPlaceholder = "__LEXITRACE_VERSION__";
const examplePlaceholder =
  "your-extension-oauth-client-id.apps.googleusercontent.com";

const env = await readEnvFile(envPath);
const configuredClientId =
  process.env.LEXITRACE_GOOGLE_OAUTH_CLIENT_ID ??
  env.LEXITRACE_GOOGLE_OAUTH_CLIENT_ID;
const releaseBuild = process.env.LEXITRACE_RELEASE === "true";
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const version = validateChromeVersion(packageJson.version);
const existingClientId = await readExistingClientId(outputPath);
const clientId =
  (isConfiguredClientId(configuredClientId)
    ? configuredClientId
    : undefined) ??
  (!releaseBuild && isConfiguredClientId(existingClientId)
    ? existingClientId
    : placeholder);

if (releaseBuild && (clientId === placeholder || clientId === examplePlaceholder)) {
  throw new Error(
    "A real LEXITRACE_GOOGLE_OAUTH_CLIENT_ID is required for release builds."
  );
}

const template = await readFile(templatePath, "utf8");
const manifest = template
  .replaceAll(placeholder, clientId)
  .replaceAll(versionPlaceholder, version);

await writeFile(outputPath, manifest);

if (clientId === placeholder || clientId === examplePlaceholder) {
  console.warn(
    "[LexiTrace] Google OAuth client ID is not configured. Google Sheet OAuth sync will be disabled until LEXITRACE_GOOGLE_OAUTH_CLIENT_ID is set."
  );
}

async function readEnvFile(url) {
  try {
    const content = await readFile(url, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=").replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

async function readExistingClientId(url) {
  try {
    const manifest = JSON.parse(await readFile(url, "utf8"));
    return manifest.oauth2?.client_id;
  } catch {
    return undefined;
  }
}

function isConfiguredClientId(value) {
  return Boolean(value && value !== placeholder && value !== examplePlaceholder);
}

function validateChromeVersion(value) {
  const parts = typeof value === "string" ? value.split(".") : [];
  const valid =
    parts.length >= 1 &&
    parts.length <= 4 &&
    parts.every(
      (part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 65535
    );
  if (!valid) {
    throw new Error(`package.json version is not Chrome-compatible: ${String(value)}`);
  }
  return value;
}
