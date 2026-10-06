import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const composeFile = fileURLToPath(
  new URL("../../../compose.test.yaml", import.meta.url),
);
const composeArgs = [
  "compose",
  "-p",
  "customer-operation-cloud-test",
  "-f",
  composeFile,
];

function docker(args: string[]): number {
  const result = spawnSync("docker", [...composeArgs, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

try {
  process.exitCode = docker(["up", "-d", "--wait", "--wait-timeout", "60"]);
  if (process.exitCode === 0) {
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const args =
      process.platform === "win32" ? ["/d", "/s", "/c", "npm test"] : ["test"];
    const result = spawnSync(command, args, {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL:
          "postgresql://customer_ops_test:customer_ops_test@127.0.0.1:5433/customer_ops_test",
      },
    });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  }
} finally {
  const cleanupStatus = docker(["down"]);
  if (cleanupStatus !== 0 && process.exitCode === 0)
    process.exitCode = cleanupStatus;
}
