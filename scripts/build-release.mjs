import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm";
const args = isWindows
  ? ["/d", "/s", "/c", "npm run build"]
  : ["run", "build"];
const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    LEXITRACE_RELEASE: "true"
  }
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Release build stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
