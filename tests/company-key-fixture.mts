import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const root = new URL("../", import.meta.url);
const metadata = new URL(".local-validation/company-key.json", root);
const env = new URL(".local-validation/company-test.env", root);
const override = new URL(".local-validation/company-test.compose.yaml", root);
function docker(args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(
      `Docker fixture command failed: ${result.stderr.slice(-400)}`,
    );
  return result.stdout;
}
if (process.argv[2] === "prepare") {
  await mkdir(new URL(".local-validation/", root), { recursive: true });
  const base = process.env.API_TEST_URL ?? "http://localhost:3001";
  async function post(path: string, body: unknown, token?: string) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`Fixture ${path} failed: ${response.status}`);
    return response.json();
  }
  const auth = await post("/register", {
    name: "Company browser fixture",
    email: `company-${randomUUID().slice(0, 8)}@example.test`,
    password: randomUUID(),
  });
  const org = await post("/organizations", { name: "Oak & Ember" }, auth.token);
  const key = await post(
    "/developer/keys",
    {
      organizationId: org.id,
      name: "Disposable company browser checks",
      scopes: ["chat:write", "documents:read", "documents:write"],
    },
    auth.token,
  );
  await writeFile(metadata, JSON.stringify({ id: key.id }));
  await writeFile(env, `HEARTH_API_KEY=${key.key}\n`);
  await writeFile(
    override,
    "services:\n  company-demo:\n    env_file:\n      - path: ./.local-validation/company-test.env\n        required: true\n",
  );
  docker([
    "compose",
    "-f",
    "compose.yaml",
    "-f",
    ".local-validation/company-test.compose.yaml",
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "company-demo",
  ]);
  console.log(
    "Company demo is using a disposable, scoped API key for browser validation.",
  );
} else if (process.argv[2] === "cleanup") {
  const { id } = JSON.parse(await readFile(metadata, "utf8"));
  docker([
    "compose",
    "exec",
    "-T",
    "core",
    "node",
    "apps/api/dist/cli/developer.js",
    "revoke",
    "--id",
    id,
  ]);
  docker([
    "compose",
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "company-demo",
  ]);
  await Promise.all([rm(metadata), rm(env), rm(override)]);
  console.log(
    "Disposable API key revoked; company-demo restored to apps/company-demo/.env.",
  );
} else throw new Error("Use prepare or cleanup");
