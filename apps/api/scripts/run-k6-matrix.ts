import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(
  root,
  process.env.RESULTS_DIR ?? `docs/Version0/results/${timestamp}`,
);
const users = (process.env.LOAD_USERS ?? "10,50,100,250,500,1000,2000")
  .split(",")
  .map(Number);
const duration = process.env.LOAD_DURATION ?? "30s";
const execution = process.env.K6_EXECUTION ?? "native";
const baseUrl =
  process.env.BASE_URL ??
  (execution === "docker" ? "http://api:3001" : "http://localhost:3001");
const dockerImage = process.env.K6_DOCKER_IMAGE ?? "grafana/k6:2.3.0";
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

if (execution !== "native" && execution !== "docker") {
  throw new Error("K6_EXECUTION must be native or docker.");
}
if (users.some((value) => !Number.isSafeInteger(value) || value < 1)) {
  throw new Error("LOAD_USERS must contain comma-separated positive integers.");
}
if (
  !/^\d+(?:\.\d+)?(?:ms|s|m|h)$/.test(duration) ||
  parseFloat(duration) <= 0
) {
  throw new Error(
    "LOAD_DURATION must be a positive k6 duration such as 30s or 1m.",
  );
}

async function command(program: string, args: string[]): Promise<string> {
  const { stdout } = await execute(program, args, {
    cwd: root,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

const inspectFormat =
  '{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"state":{{json .State}},"restartCount":{{.RestartCount}},"memoryBytes":{{.HostConfig.Memory}},"nanoCpus":{{.HostConfig.NanoCpus}}}';

async function containerState(ids: string[]) {
  const text = await command("docker", [
    "inspect",
    "--format",
    inspectFormat,
    ...ids,
  ]);
  return text
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function cpuState(id: string) {
  const membership = await command("docker", [
    "exec",
    id,
    "cat",
    "/proc/self/cgroup",
  ]);
  const group = membership
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3);
  if (group === undefined)
    throw new Error("The matrix runner requires cgroup v2.");
  // A private cgroup namespace reports '/'; Docker Desktop can expose the
  // full host hierarchy instead, so resolve this process's actual group.
  const path = `/sys/fs/cgroup${group === "/" ? "" : group}`;
  const text = await command("docker", ["exec", id, "cat", `${path}/cpu.stat`]);
  return {
    path,
    cpuMax: await command("docker", ["exec", id, "cat", `${path}/cpu.max`]),
    ...Object.fromEntries(
      text.split("\n").map((line) => {
        const [key, value] = line.trim().split(/\s+/);
        return [key, Number(value)];
      }),
    ),
  };
}

async function run() {
  await mkdir(output, { recursive: true });
  const ids = (
    await command("docker", ["compose", "ps", "-q", "api", "postgres"])
  )
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length !== 2)
    throw new Error("Start both API and PostgreSQL with Docker Compose first.");
  const initial = await containerState(ids);
  for (const container of initial) {
    if (
      container.memoryBytes !== 1073741824 ||
      container.nanoCpus !== 1000000000
    ) {
      throw new Error(
        `${container.name}: expected 1 GiB and 1 CPU. Apply compose.yaml first.`,
      );
    }
  }
  const apiId = ids.find((_, index) =>
    String(initial[index]?.name).includes("-api-"),
  );
  if (!apiId) throw new Error("API container was not found.");
  const networks = JSON.parse(
    await command("docker", [
      "inspect",
      "--format",
      "{{json .NetworkSettings.Networks}}",
      apiId,
    ]),
  );
  const network = Object.keys(networks)[0];
  if (!network) throw new Error("API container has no Docker network.");
  const generatorPrefix =
    execution === "docker"
      ? [
          "run",
          "--rm",
          "--network",
          network,
          "--mount",
          `type=bind,source=${join(root, "apps/api/tests/k6")},target=/scripts,readonly`,
          "--mount",
          `type=bind,source=${output},target=/results`,
          dockerImage,
        ]
      : [];
  const generatorProgram = execution === "docker" ? "docker" : "k6";
  const metadata = {
    startedAt: new Date().toISOString(),
    sourceCommit: await command("git", ["rev-parse", "HEAD"]),
    sourceChanges: await command("git", ["status", "--short"]),
    host: {
      platform: platform(),
      release: release(),
      logicalCpus: cpus().length,
      cpu: cpus()[0]?.model,
      memoryBytes: totalmem(),
    },
    docker: JSON.parse(
      await command("docker", [
        "info",
        "--format",
        '{"serverVersion":{{json .ServerVersion}},"operatingSystem":{{json .OperatingSystem}},"kernelVersion":{{json .KernelVersion}},"logicalCpus":{{.NCPU}},"memoryBytes":{{.MemTotal}}}',
      ]),
    ),
    execution,
    generatorNetwork:
      execution === "docker" ? network : "Windows host published port",
    generatorImage: execution === "docker" ? dockerImage : null,
    k6Version:
      execution === "docker"
        ? await command("docker", ["run", "--rm", dockerImage, "version"])
        : await command("k6", ["version"]),
    nodeVersion: await command("docker", ["exec", apiId, "node", "--version"]),
    postgresVersion: await command("docker", [
      "compose",
      "exec",
      "-T",
      "postgres",
      "postgres",
      "--version",
    ]),
    baseUrl,
    initialContainers: initial,
    sampleDelayMs: 2000,
    note: "k6 against Docker API/PostgreSQL; generator location is recorded separately. Limits are maxima. Closed model; one GET then sleep(1). Each run creates a user and organization; no deletion API exists. Two-second delay between Docker stats queries; actual sampling intervals include query time.",
  };
  await writeFile(
    join(output, "environment.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  const runs: Record<string, unknown>[] = [];
  const cases = [
    { users: 1, duration: "10s", role: "warmup" },
    ...users.map((count) => ({ users: count, duration, role: "load" })),
  ];
  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index]!;
    const name = `${String(index).padStart(2, "0")}-${testCase.users}vu-${testCase.duration}`;
    const summaryPath = join(output, `${name}.summary.json`);
    const logPath = join(output, `${name}.log`);
    const args = [
      ...generatorPrefix,
      "run",
      "--quiet",
      "--no-color",
      "--no-usage-report",
      "--include-system-env-vars=false",
      "--vus",
      String(testCase.users),
      "--duration",
      testCase.duration,
      "--summary-trend-stats",
      "avg,min,med,max,p(90),p(95),p(99)",
      "--summary-export",
      execution === "docker" ? `/results/${name}.summary.json` : summaryPath,
      "-e",
      `BASE_URL=${baseUrl}`,
      execution === "docker"
        ? "/scripts/organization-read.k6.js"
        : "apps/api/tests/k6/organization-read.k6.js",
    ];
    const before = await containerState(ids);
    const cpuBefore = await cpuState(apiId);
    const startedAt = new Date().toISOString();
    const log = createWriteStream(logPath);
    console.log(`Starting ${name}; ${startedAt}`);
    const child = spawn(generatorProgram, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let finished = false;
    const completion = new Promise<number>((done, reject) => {
      child.once("error", (error) => {
        finished = true;
        reject(error);
      });
      child.once("close", (code) => {
        finished = true;
        done(code ?? 1);
      });
    });
    const samples: Record<string, unknown>[] = [];
    const sampler = (async () => {
      while (!finished) {
        const sampledAt = new Date().toISOString();
        try {
          const stats = await command("docker", [
            "stats",
            "--no-stream",
            "--format",
            "{{json .}}",
            ...ids,
          ]);
          for (const line of stats.split("\n"))
            samples.push({ sampledAt, ...JSON.parse(line) });
        } catch (error) {
          samples.push({ sampledAt, error: String(error) });
        }
        if (!finished) await sleep(2000);
      }
    })();
    const exitCode = await completion;
    await sampler;
    await new Promise<void>((done) => log.end(done));
    const endedAt = new Date().toISOString();
    const after = await containerState(ids);
    const cpuAfter = await cpuState(apiId);
    const record = {
      name,
      ...testCase,
      startedAt,
      endedAt,
      exitCode,
      command: [generatorProgram, ...args],
      before,
      after,
      cpuBefore,
      cpuAfter,
      sampleCount: samples.length,
      summaryFile: `${name}.summary.json`,
      logFile: `${name}.log`,
      statsFile: `${name}.stats.json`,
    };
    runs.push(record);
    await writeFile(
      join(output, `${name}.stats.json`),
      JSON.stringify(samples, null, 2) + "\n",
    );
    await writeFile(
      join(output, "runs.json"),
      JSON.stringify(runs, null, 2) + "\n",
    );
    try {
      const summary = JSON.parse(await readFile(summaryPath, "utf8"));
      const metric =
        summary.metrics["http_req_duration{operation:organization_read}"];
      console.log(
        `Finished ${name}: exit=${exitCode}, read p95=${metric?.["p(95)"] ?? metric?.values?.["p(95)"]} ms`,
      );
    } catch {
      console.log(
        `Finished ${name}: exit=${exitCode}; inspect the log for missing summary.`,
      );
    }
    if (exitCode !== 0 && exitCode !== 99) {
      console.log(
        "Stopping matrix after an operational failure; all conducted runs were retained.",
      );
      break;
    }
    if (index < cases.length - 1) await sleep(5000);
  }
  console.log(`Results saved in ${output}`);
  if (runs.some((record) => record.exitCode !== 0)) process.exitCode = 1;
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
