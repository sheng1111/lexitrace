import { readFile, writeFile } from "node:fs/promises";

const templatePath = new URL("../config/manifest.template.json", import.meta.url);
const outputPath = new URL("../public/manifest.json", import.meta.url);
const envPath = new URL("../.env", import.meta.url);
const placeholder = "__REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID__";
const examplePlaceholder =
  "your-extension-oauth-client-id.apps.googleusercontent.com";

const env = await readEnvFile(envPath);
const clientId =
  process.env.LEXITRACE_GOOGLE_OAUTH_CLIENT_ID ??
  env.LEXITRACE_GOOGLE_OAUTH_CLIENT_ID ??
  placeholder;
const releaseBuild = process.env.LEXITRACE_RELEASE === "true";

if (releaseBuild && (clientId === placeholder || clientId === examplePlaceholder)) {
  throw new Error(
    "A real LEXITRACE_GOOGLE_OAUTH_CLIENT_ID is required for release builds."
  );
}

const template = await readFile(templatePath, "utf8");
const manifest = template.replaceAll(placeholder, clientId);

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
