import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Existing DB-focused suites isolate their concern; rate-limit suites explicitly
// inject real Redis instances and never use a process-local counter fallback.
process.env.NODE_ENV = "test";

if (process.env.TEST_DATABASE_URL) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "tests/*.test.ts"],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: "inherit",
    },
  );
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} else {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./test-postgres.ts", import.meta.url))],
    {
      stdio: "inherit",
    },
  );
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
