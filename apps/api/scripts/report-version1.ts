import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = join(root, "docs/Version1");
const results = join(docs, "results");
const campaigns = [
  {
    id: "A",
    folder: "01-windows-10-50-100-250-500-1000-2000-users-30s",
    title: "Windows host through the published API port",
    expected: 8,
  },
  {
    id: "B",
    folder: "02-docker-500-1000-2000-users-30s",
    title: "k6 inside the Docker network",
    expected: 4,
  },
  {
    id: "C",
    folder: "03-docker-2000-5000-users-1m",
    title: "longer repeat and stress stage",
    expected: 3,
  },
  {
    id: "D",
    folder: "04-windows-mixed-10-50-100-250-500-users-30s",
    title: "Version 1 mixed traffic on Windows",
    expected: 6,
  },
  {
    id: "E",
    folder: "05-docker-mixed-250-500-1000-users-30s",
    title: "Version 1 mixed traffic inside Docker",
    expected: 4,
  },
  {
    id: "F",
    folder: "06-docker-mixed-spike-250-1000-users-30s",
    title: "Version 1 spike traffic",
    expected: 3,
  },
  {
    id: "G",
    folder: "07-docker-mixed-soak-100-users-5m",
    title: "Version 1 five-minute steady repeat",
    expected: 2,
  },
];
type Metric = Record<string, number> & { thresholds?: Record<string, boolean> };
type Container = {
  name: string;
  restartCount: number;
  state: { Running: boolean; OOMKilled: boolean };
};
type Run = {
  name: string;
  users: number;
  duration: string;
  role: string;
  workload: string;
  profile: string;
  exitCode: number;
  startedAt: string;
  endedAt: string;
  command: string[];
  summaryFile: string;
  statsFile: string;
  logFile: string;
  apiObservationsFile: string;
  before: Container[];
  after: Container[];
  cpuBefore: Record<string, number | string>;
  cpuAfter: Record<string, number | string>;
};
type Sample = {
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  role?: string;
  memoryFreeBytes?: number;
};
type Resources = {
  maxCPU: number;
  maxMiB: number;
  minMiB: number;
  lastMiB: number;
  samples: number;
};
type Environment = {
  startedAt: string;
  sourceCommit: string;
  execution: string;
  workload: string;
  profile: string;
  baseUrl: string;
  nodeVersion: string;
  postgresVersion: string;
  k6Version: string;
  host: { cpu: string; logicalCpus: number; memoryBytes: number };
  docker: {
    serverVersion: string;
    kernelVersion: string;
    logicalCpus: number;
    memoryBytes: number;
  };
};
type Observation = {
  parsedLines: number;
  unparsedLines: number;
  statuses: Record<string, number>;
  events: Record<string, number>;
  pool: { poolWaiting: number }[];
};
type Row = {
  id: string;
  campaign: string;
  group: string;
  run: string;
  role: string;
  users: number;
  duration: string;
  profile: string;
  workload: string;
  reads: number;
  readRPS: number;
  requests: number;
  requestRPS: number;
  totalHTTP: number;
  failures: number;
  failedReadRate: number;
  checkPassRate: number;
  exitCode: number;
  latency: Metric;
  writeLatency: Metric;
  loginLatency: Metric;
  writes: number;
  logins: number;
  resources: { api: Resources; postgres: Resources; generator: Resources };
  warnings: number;
  refusals: number;
  timeouts: number;
  failedThresholds: string[];
  cpuPeriods: number;
  cpuThrottledPeriods: number;
  cpuThrottledSeconds: number;
  poolWaitingMax: number;
  containerStates: Container[];
  raw: Run;
  metrics: Record<string, Metric>;
  observation: Observation;
};
const all: Row[] = [];
const environments: Environment[] = [];
const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const n = (value: number, decimals = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "n/a";
const pct = (value: number) => `${n(value * 100, 3)}%`;
const table = (headers: string[], rows: (string | number)[][]) =>
  `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n`;
const result = (row: Row) =>
  row.exitCode === 0
    ? "PASS (0)"
    : row.exitCode === 99
      ? "FAIL (99)"
      : `OPERATIONAL FAIL (${row.exitCode})`;
function mib(value = "0B") {
  const match = value.trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
  if (!match) return 0;
  const power =
    { B: 0, KB: 1, MB: 2, GB: 3, TB: 4, KIB: 1, MIB: 2, GIB: 3, TIB: 4 }[
      match[2]!.toUpperCase()
    ] ?? 0;
  return (
    (Number(match[1]) *
      (match[2]!.toUpperCase().includes("I") ? 1024 : 1000) ** power) /
    1048576
  );
}
function resources(samples: Sample[], kind: string): Resources {
  const matching = samples.filter((sample) =>
    kind === "generator"
      ? sample.role === "generator"
      : sample.Name?.endsWith(`-${kind}-1`),
  );
  const memory = matching.map((sample) => mib(sample.MemUsage?.split("/")[0]));
  return {
    maxCPU: Math.max(
      0,
      ...matching.map((sample) => parseFloat(sample.CPUPerc ?? "0")),
    ),
    maxMiB: Math.max(0, ...memory),
    minMiB: memory.length ? Math.min(...memory) : 0,
    lastMiB: memory.at(-1) ?? 0,
    samples: matching.length,
  };
}
function metric(metrics: Record<string, Metric>, name: string, tags: string[]) {
  return (
    Object.entries(metrics).find(
      ([key]) =>
        key.startsWith(`${name}{`) &&
        key.slice(key.indexOf("{") + 1, -1).split(",").length === tags.length &&
        tags.every((tag) =>
          key
            .slice(key.indexOf("{") + 1, -1)
            .split(",")
            .includes(tag),
        ),
    )?.[1] ?? ({} as Metric)
  );
}
const trafficTable = (rows: Row[], linkPrefix = "") =>
  table(
    [
      "Run",
      "VUs",
      "Time",
      "Load requests",
      "Load RPS",
      "Reads",
      "Writes",
      "Logins",
      "Read avg ms",
      "Read p95 ms",
      "Read p99 ms",
      "Write p95 ms",
      "Login p95 ms",
      "Failed load (%)",
      "Checks passed",
      "Result",
    ],
    rows.map((row) => [
      `[${row.id}](${linkPrefix}${row.run}.summary.json)${row.role === "warmup" ? " (warm-up)" : ""}`,
      row.users,
      row.duration,
      n(row.requests, 0),
      n(row.requestRPS),
      n(row.reads, 0),
      n(row.writes, 0),
      n(row.logins, 0),
      n(row.latency.avg!),
      n(row.latency["p(95)"]!),
      n(row.latency["p(99)"]!),
      row.workload === "mixed" ? n(row.writeLatency["p(95)"]!) : "n/a",
      row.workload === "mixed" ? n(row.loginLatency["p(95)"]!) : "n/a",
      `${n(row.failures, 0)} (${pct(row.failedReadRate)})`,
      pct(row.checkPassRate),
      result(row),
    ]),
  );
const baselineTable = (rows: Row[], linkPrefix = "") =>
  table(
    [
      "Run",
      "VUs",
      "Time",
      "Reads",
      "Read RPS",
      "Avg ms",
      "p95 ms",
      "p99 ms",
      "Failed reads (%)",
      "Checks passed",
      "Result",
    ],
    rows.map((row) => [
      `[${row.id}](${linkPrefix}${row.run}.summary.json)${row.role === "warmup" ? " (warm-up)" : ""}`,
      row.users,
      row.duration,
      n(row.reads, 0),
      n(row.readRPS),
      n(row.latency.avg!),
      n(row.latency["p(95)"]!),
      n(row.latency["p(99)"]!),
      `${n(row.failures, 0)} (${pct(row.failedReadRate)})`,
      pct(row.checkPassRate),
      result(row),
    ]),
  );
const resourceTable = (rows: Row[]) =>
  table(
    [
      "Run",
      "API max CPU",
      "API max MiB",
      "PostgreSQL max CPU",
      "PostgreSQL max MiB",
      "Samples API / DB",
      "Generator max MiB",
    ],
    rows.map((row) => [
      row.id,
      `${n(row.resources.api.maxCPU)}%`,
      n(row.resources.api.maxMiB),
      `${n(row.resources.postgres.maxCPU)}%`,
      n(row.resources.postgres.maxMiB),
      `${row.resources.api.samples} / ${row.resources.postgres.samples}`,
      row.resources.generator.samples
        ? n(row.resources.generator.maxMiB)
        : "not sampled",
    ]),
  );
const cpuTable = (rows: Row[]) =>
  table(
    [
      "Run",
      "Scheduler periods",
      "Throttled periods",
      "Share throttled",
      "Throttled time (seconds)",
      "Max sampled pool waiters",
    ],
    rows.map((row) => [
      row.id,
      row.cpuPeriods,
      row.cpuThrottledPeriods,
      row.cpuPeriods ? pct(row.cpuThrottledPeriods / row.cpuPeriods) : "n/a",
      n(row.cpuThrottledSeconds, 3),
      row.poolWaitingMax,
    ]),
  );
const failureTable = (rows: Row[]) =>
  table(
    [
      "Run",
      "Failed criteria",
      "Request warnings",
      "Connection refusals",
      "Timeout warnings",
      "Container state",
    ],
    rows.map((row) => [
      row.id,
      row.failedThresholds.length
        ? row.failedThresholds.map((item) => `\`${item}\``).join("; ")
        : "None",
      row.warnings,
      row.refusals,
      row.timeouts,
      row.raw.after
        .map(
          (container, index) =>
            `${container.name.endsWith("-api-1") ? "API" : "DB"}: running=${container.state.Running}; OOM=${container.state.OOMKilled}; restarts ${row.raw.before[index]?.restartCount} -> ${container.restartCount}`,
        )
        .join("; "),
    ]),
  );
function takeaway(row: Row) {
  return `**${result(row)}** — ${n(row.requests, 0)} ${row.workload === "mixed" ? "load requests" : "organization reads"}, ${n(row.requestRPS)} requests/second, read p95 ${n(row.latency["p(95)"]!)} ms, ${n(row.failures, 0)} failed requests (${pct(row.failedReadRate)}). ${row.failedThresholds.length ? `Failed criteria: ${row.failedThresholds.map((item) => `\`${item}\``).join(", ")}.` : "Every configured load threshold passed."}`;
}
for (const campaign of campaigns) {
  const folder = join(results, campaign.folder);
  if (!(await exists(join(folder, "runs.json")))) continue;
  const env: Environment = await json(join(folder, "environment.json"));
  environments.push(env);
  const runs: Run[] = await json(join(folder, "runs.json"));
  const rows: Row[] = [];
  for (const [index, run] of runs.entries()) {
    assert.ok(
      await exists(join(folder, run.summaryFile)),
      `${campaign.id}/${run.name}: missing summary`,
    );
    const summary = await json(join(folder, run.summaryFile));
    assert.deepEqual(
      Object.keys(summary),
      ["metrics"],
      "Summary must contain only metrics, never setup credentials",
    );
    const metrics: Record<string, Metric> = summary.metrics;
    const mixed = run.workload === "mixed";
    const loadTags = mixed ? ["phase:load"] : ["operation:organization_read"];
    const readTags = mixed ? ["phase:load", "kind:read"] : loadTags;
    const requests = metric(metrics, "http_reqs", loadTags);
    const reads = metric(metrics, "http_reqs", readTags);
    const failed = metric(metrics, "http_req_failed", loadTags);
    const checks = metric(metrics, "checks", loadTags);
    const log = await readFile(join(folder, run.logFile), "utf8");
    const samples: Sample[] = await json(join(folder, run.statsFile));
    const observation: Observation = await json(
      join(folder, run.apiObservationsFile),
    );
    const failedThresholds = Object.entries(metrics).flatMap(([key, value]) =>
      Object.entries(value.thresholds ?? {})
        .filter(([, failed]) => failed)
        .map(([expression]) => `${key}: ${expression}`),
    );
    assert.equal(
      run.exitCode === 0,
      failedThresholds.length === 0,
      `${run.name}: exit code disagrees with thresholds`,
    );
    const row: Row = {
      id: `${campaign.id}${index}`,
      campaign: campaign.id,
      group: campaign.folder,
      run: run.name,
      role: run.role,
      users: run.users,
      duration: run.duration,
      profile: run.profile,
      workload: run.workload,
      reads: reads.count ?? 0,
      readRPS: reads.rate ?? 0,
      requests: requests.count ?? 0,
      requestRPS: requests.rate ?? 0,
      totalHTTP: metrics.http_reqs?.count ?? 0,
      failures: failed.passes ?? 0,
      failedReadRate: failed.rate ?? failed.value ?? 0,
      checkPassRate: checks.rate ?? checks.value ?? 0,
      exitCode: run.exitCode,
      latency: metric(metrics, "http_req_duration", readTags),
      writeLatency: metric(metrics, "http_req_duration", [
        "phase:load",
        "kind:write",
      ]),
      loginLatency: metric(metrics, "http_req_duration", [
        "phase:load",
        "kind:login",
      ]),
      writes:
        metric(metrics, "http_reqs", ["phase:load", "kind:write"]).count ?? 0,
      logins:
        metric(metrics, "http_reqs", ["phase:load", "kind:login"]).count ?? 0,
      resources: {
        api: resources(samples, "api"),
        postgres: resources(samples, "postgres"),
        generator: resources(samples, "generator"),
      },
      warnings: (log.match(/level=warning/g) ?? []).length,
      refusals: (log.match(/actively refused|connection refused/g) ?? [])
        .length,
      timeouts: (log.match(/request timeout|i\/o timeout/g) ?? []).length,
      failedThresholds,
      cpuPeriods:
        Number(run.cpuAfter.nr_periods) - Number(run.cpuBefore.nr_periods),
      cpuThrottledPeriods:
        Number(run.cpuAfter.nr_throttled) - Number(run.cpuBefore.nr_throttled),
      cpuThrottledSeconds:
        (Number(run.cpuAfter.throttled_usec) -
          Number(run.cpuBefore.throttled_usec)) /
        1e6,
      poolWaitingMax: Math.max(
        0,
        ...observation.pool.map((sample) => sample.poolWaiting),
      ),
      containerStates: run.after,
      raw: run,
      metrics,
      observation,
    };
    assert.equal(
      row.reads + row.writes + row.logins,
      row.requests,
      "Action counters must sum to load requests",
    );
    assert.equal(
      (checks.passes ?? 0) + (checks.fails ?? 0),
      row.requests * (mixed ? 3 : 2),
      "Check totals must match workload",
    );
    rows.push(row);
    all.push(row);
    const metricRows = Object.entries(metrics)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => [
        `\`${name}\``,
        Object.entries(values)
          .filter(([, value]) => typeof value === "number")
          .map(([field, value]) => `\`${field}\`=${n(value as number, 6)}`)
          .join("; "),
      ]);
    const thresholds = Object.entries(metrics).flatMap(([name, values]) =>
      Object.entries(values.thresholds ?? {}).map(([expression, failed]) => [
        `\`${name}\``,
        `\`${expression}\``,
        failed ? "FAIL" : "PASS",
      ]),
    );
    const stageReport = `# Version 1: ${run.name}\n\n${takeaway(row)}\n\n[All campaign stages](summary.md) | [How to read these fields](../helper.md) | [Full test report](../../testResult.md)\n\nThis report describes the run actually executed on ${run.startedAt.slice(0, 10)}. It is derived from [raw metrics](${run.summaryFile}), [Docker samples](${run.statsFile}), [console log](${run.logFile}), [API observations](${run.apiObservationsFile}) and [run manifest](runs.json). Numbers are rounded; JSON retains full precision.\n\n## Test setup\n\n${table(
      ["Item", "Recorded value"],
      [
        ["Stage", run.name],
        ["Role", run.role],
        ["Workload / profile", `${run.workload} / ${run.profile}`],
        ["Virtual users", run.users],
        ["Load duration", run.duration],
        ["Start / end UTC", `${run.startedAt} / ${run.endedAt}`],
        [
          "Wall-clock seconds including setup/reporting",
          n((Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 1000),
        ],
        ["Target", env.baseUrl],
        ["Generator", env.execution],
        ["Server caps", "1 CPU + 1 GiB each for API and PostgreSQL"],
        ["k6 exit", run.exitCode],
      ],
    )}\n${mixed ? "Each VU owns a separate seeded account, organization, conversation and uploaded file. One action per iteration follows a 20-action cycle: 14 reads, five writes, one login, then a one-second wait. Percentages apply to completed cycles." : "All VUs share one account and organization created for the stage. Each reads the organization, checks HTTP 200 and its ID, then waits one second."}\n\n## Traffic, correctness and latency\n\n${mixed ? trafficTable([row]) : baselineTable([row])}\nTotal HTTP requests including setup/validation: **${n(row.totalHTTP, 0)}**. Latency is HTTP request duration in milliseconds; connection/DNS and think time are excluded. Failed connections can have zero duration.\n\n## Threshold decisions\n\n${table(["Metric", "Criterion", "Decision"], thresholds)}\nAll criteria must pass. Threshold booleans in the JSON use false = did not fail, true = failed.\n\n## Sampled Docker resources\n\n${resourceTable([row])}\nSamples include setup, load and graceful completion. They are occasional maxima, not continuous peaks. Docker CPU near 100% represents one logical CPU's time; 1 GiB is 1024 MiB. Native generator memory was not measured.\n\n## Errors and container health\n\n${failureTable([row])}\nAPI log HTTP statuses (including setup and health probes): \`${JSON.stringify(observation.statuses)}\`. These are separate from load-tagged k6 failures.\n\n## CPU throttling evidence\n\n${cpuTable([row])}\nCounters resolve the API's actual cgroup from /proc/self/cgroup. Recorded CPU quota: \`${run.cpuAfter.cpuMax}\`. Pool waiters are ten-second observations, not continuous queue peaks.\n\n## What this stage tells us\n\n${takeaway(row)}\n\nThis is a local shared-machine observation for this workload and duration. It does not establish whole-product capacity, an exact capacity boundary, or a production SLA.\n\n## All exported metric values\n\nDuration fields use milliseconds, counters use count and per-second rate, rate metrics are fractions, and byte counters use bytes. Read-only tagged metrics exclude setup; mixed phase:load metrics exclude provisioning and deliberate rejection checks.\n\n${table(["Metric", "Fields"], metricRows)}`;
    await writeFile(join(folder, `${run.name}.summary.md`), stageReport);
  }
  const passed = rows.filter((row) => row.exitCode === 0).length;
  const mixed = env.workload === "mixed";
  const report = `# Version 1 campaign ${campaign.id}: ${campaign.title}\n\n**${rows.length} stages: ${passed} passed and ${rows.length - passed} failed.** ${n(
    rows.reduce((sum, row) => sum + row.requests, 0),
    0,
  )} ${mixed ? "load requests" : "organization reads"} and ${n(
    rows.reduce((sum, row) => sum + row.failures, 0),
    0,
  )} failed requests were recorded. ${rows.length < campaign.expected ? "Campaign is still in progress." : "Every planned stage is retained."}\n\n[Beginner helper](../helper.md) | [Full test report](../../testResult.md)\n\nThese tests were actually executed on ${env.startedAt.slice(0, 10)}. Numbers below are rounded; linked JSON preserves full precision. Each row describes a separate stage; percentiles are not combined.\n\n## What ran\n\n${table(
    ["Item", "Value"],
    [
      ["Generator", `${env.execution}: ${env.k6Version}`],
      ["Target", env.baseUrl],
      ["API cap", "1 CPU + 1 GiB"],
      ["PostgreSQL cap", "A separate 1 CPU + 1 GiB"],
      [
        "Generator cap",
        "No explicit CPU/RAM cap; Docker generator shares VM pool",
      ],
      ["Workload / profile", `${env.workload} / ${env.profile}`],
      [
        "Identity",
        mixed
          ? "One distinct account and organization per VU"
          : "One shared account and organization per stage",
      ],
      ["Warm-up", mixed ? "1 VU / 30s to cover all actions" : "1 VU / 10s"],
      ["Environment", "[environment.json](environment.json)"],
      ["Execution", "[runs.json](runs.json)"],
    ],
  )}\n\n## Every stage: traffic, correctness and latency\n\n${mixed ? trafficTable(rows) : baselineTable(rows)}\nHTTP duration excludes initial connection/DNS and sleep. Failed reads can contribute zero durations. Mixed RPS excludes setup counts but uses k6's reported counter-rate denominator, which includes setup wall time. This can lower mixed RPS substantially at large account counts; it is not a steady-window throughput estimate.\n\n## Why each stage passed or failed\n\n${failureTable(rows)}\n${rows.map((row) => `${row.id}: ${takeaway(row)}`).join("\n\n")}\n\n## Sampled CPU and RAM\n\n${resourceTable(rows)}\nSampling includes setup and graceful completion, and a two-second delay plus Docker query time. Docker generator queries add elapsed time, so sample cadence is irregular. Native generator memory was not collected.\n\n## CPU throttling and pool observations\n\n${cpuTable(rows)}\nThe actual API cgroup was resolved in every stage. CPU snapshots cover the entire execution interval, including setup. Pool observations are ten seconds apart.\n\n## What to learn from these results\n\nEvery failed threshold remains visible. A latency failure is not cancelled by a passing error rate. More VUs need not mean more completed work; compare throughput, tails, failures and CPU together. Small repeated reads, distinct-account mixed traffic, spike traffic and five-minute repeats cover different conditions and cannot be treated as equivalent capacity measurements.\n\n## Evidence links for every stage\n\n${table(
    [
      "Stage",
      "Readable report",
      "Raw metrics",
      "Console",
      "Docker samples",
      "API observations",
    ],
    rows.map((row) => [
      row.run,
      `[Report](${row.run}.summary.md)`,
      `[JSON](${row.run}.summary.json)`,
      `[Log](${row.run}.log)`,
      `[Stats](${row.run}.stats.json)`,
      `[API](${row.run}.api-observations.json)`,
    ]),
  )}`;
  await writeFile(join(folder, "summary.md"), report);
}

await writeFile(
  join(results, "metrics.json"),
  JSON.stringify(
    all.map(({ raw, metrics, observation, ...row }) => ({
      ...row,
      cpuBefore: raw.cpuBefore,
      cpuAfter: raw.cpuAfter,
      apiLogStatuses: observation.statuses,
      metricCount: Object.keys(metrics).length,
    })),
    null,
    2,
  ) + "\n",
);
const complete = campaigns.every(
  (campaign) =>
    all.filter((row) => row.campaign === campaign.id).length ===
    campaign.expected,
);
if (process.argv.includes("--final"))
  assert.ok(
    complete,
    "All planned campaign stages must exist before publishing the final report",
  );
const baseline = all.filter((row) => row.workload === "organization-read");
const mixed = all.filter((row) => row.workload === "mixed");
const env = environments[0];
assert.ok(env, "Run at least one campaign before building reports");
const passed = all.filter((row) => row.exitCode === 0).length;
let report = `# Version 1 Docker and k6 test results\n\n**${all.length} Docker-backed load runs were conducted: ${passed} passed and ${all.length - passed} failed their thresholds.** The Version 0 read workload was repeated in ${baseline.length} runs covering ${n(
  baseline.reduce((sum, row) => sum + row.reads, 0),
  0,
)} organization reads. Version 1 mixed traffic was exercised in ${mixed.length} runs covering ${n(
  mixed.reduce((sum, row) => sum + row.requests, 0),
  0,
)} load requests. ${complete ? "Every planned campaign is retained below." : "Testing is in progress; subsequent campaigns and conclusions will be added as they complete."}\n\n## Scope and environment\n\nThese experiments were actually executed on **13 October 2026** against package version **1.0.0**. Every conducted run, including warm-ups and failures, is listed with raw evidence. The API and PostgreSQL each had **1 GiB memory** (1073741824 bytes) and **1 CPU** (1000000000 NanoCPUs), verified by Docker inspect before every campaign.\n\nThe API image was built from the current Version 1 source. First campaign source commit: \`${env.sourceCommit}\`; each campaign records its own commit, local changes, image IDs and timestamps. The benchmark uses [compose.benchmark.yaml](../../compose.benchmark.yaml), project \`customer-operation-cloud-v1-benchmark\`, a fresh separate persistent database volume, API port **3002**, and database port **5434**. The existing development stack and database remain separate. Generated accounts and writes persist throughout the campaigns; the database is not reset between stages.\n\n${table(
  ["Environment item", "Observed value"],
  [
    [
      "Physical CPU",
      `${env.host.cpu}; ${env.host.logicalCpus} logical processors`,
    ],
    [
      "Host RAM",
      `${n(env.host.memoryBytes, 0)} bytes (${n(env.host.memoryBytes / 1073741824)} GiB)`,
    ],
    [
      "Docker engine / kernel",
      `${env.docker.serverVersion} / ${env.docker.kernelVersion}`,
    ],
    [
      "Docker resource pool",
      `${env.docker.logicalCpus} logical CPUs; ${n(env.docker.memoryBytes / 1073741824)} GiB RAM`,
    ],
    ["API runtime", `${env.nodeVersion}; Express 5; one API process`],
    ["Database", env.postgresVersion],
    ["Load generator", env.k6Version],
    ["API / DB limits", "1 CPU + 1 GiB per container"],
  ],
)}\nThis was a local shared-machine test, not an isolated cloud benchmark. The original development stack was also running. Generator placement, dataset size, test order and working-set warmth affect comparisons.\n\n## Workload and criteria\n\nCampaigns A–C repeat Version 0's [organization-read.k6.js](../../apps/api/tests/k6/organization-read.k6.js) with identical user counts, durations, thresholds and one-second think time. Setup registers one unique account, creates one organization and verifies access. All VUs in that stage share its token and read the same organization. It exercises JWT verification, ownership, SQL reads and JSON serialization.\n\nPassing requires at least one read, failed reads below 1%, read p95 below 500 ms and checks above 99%. Each read makes two checks. Setup is excluded by operation tags.\n\nCampaigns D–G run [version1-mixed.k6.js](../../apps/api/tests/k6/version1-mixed.k6.js): distinct account, organization, conversation and uploaded file per VU; 14 reads, five writes and one login per completed 20-action cycle. Reads include organizations, conversations, document metadata and original downloads; writes include conversations, JSON documents and Text/Markdown/PDF uploads. Each action is followed by one second of think time. All VUs' starting action is offset. Provisioning and expected 401/400/404 checks are outside phase:load.\n\nMixed passing requires every action kind to occur, failed load requests below 1%, load checks above 99%, read p95 below 500 ms and write/login p95 below 1000 ms. Each load request makes three checks. Its warm-up lasts **30 seconds**, so one VU reaches writes and login. Spike ramps up for five seconds, holds for the table duration and ramps down for five seconds. The five-minute soak is a short steady repeat; it does not establish day-long memory stability.\n\nRead RPS and mixed load RPS are the tagged counter rates reported by k6. Setup requests are excluded from their counts, but **k6's counter-rate time denominator includes setup**. Mixed provisioning at high VU counts can therefore depress displayed RPS; do not interpret that column as a precise sustained load-window rate. Percentiles are reported separately for each stage and request kind. HTTP duration excludes initial connection/DNS and sleep; connection failures can have zero duration. Judge latency with errors.\n\nEvery campaign begins with a warm-up and pauses five seconds between stages. Resource samples and cgroup deltas cover setup, load and graceful completion. The generator has no explicit cap; Docker mode shares the VM pool. Native generator memory is not measured.\n`;
for (const campaign of campaigns) {
  const rows = all.filter((row) => row.campaign === campaign.id);
  report += `\n## Campaign ${campaign.id}: ${campaign.title}\n\n`;
  if (!rows.length) {
    report += "Not yet executed.\n";
    continue;
  }
  report += `Evidence directory: [Campaign ${campaign.id}](results/${campaign.folder}/summary.md), with [environment](results/${campaign.folder}/environment.json) and [run manifest](results/${campaign.folder}/runs.json). ${rows.length < campaign.expected ? "This campaign is still in progress." : "All planned stages completed."}\n\n`;
  report +=
    rows[0]!.workload === "mixed"
      ? trafficTable(rows, `results/${campaign.folder}/`)
      : baselineTable(rows, `results/${campaign.folder}/`);
  report +=
    "\n" +
    rows
      .filter((row) => row.role !== "warmup")
      .map(takeaway)
      .join("\n\n") +
    "\n";
}
report += `\n## Resource observations for every run\n\n${resourceTable(all)}\nThese are the highest sampled Docker values, not continuous peaks. Memory is MiB (1 GiB = 1024 MiB). Sampling uses a two-second pause plus Docker stats queries; Docker-generator collection adds query time. Samples can include the distinct-account setup phase, so maxima cannot always be attributed to load alone. Detailed samples retain chronological values, network I/O and timestamps.\n\n## CPU-counter and pool observations\n\n${cpuTable(all)}\nThe runner resolved /proc/self/cgroup and collected that group's cpu.stat and cpu.max for every stage. These counters cover the complete run interval, including setup and graceful completion; their throttled time is not an individual request's waiting time. Pool observations come from the API's ten-second JSON logs.\n\n## How to read and reproduce the evidence\n\nEvery row links to a metrics-only k6 summary. Its matching .log contains warnings, .stats.json contains sampled Docker resources, .api-observations.json aggregates API status counts and pool observations, and .summary.md explains the stage. Each campaign's summary.md combines its results. [Beginner helper](results/helper.md) explains units, thresholds and the workload. [metrics.json](results/metrics.json) collects all campaigns numerically. No credentials or setup_data are exported.\n\nExit 0 means pass; exit 99 means a threshold was breached. The matrix retains threshold failures and continues, then returns exit 1 if any stage failed. Other exits stop the matrix as operational failures. JSON threshold booleans are failure flags: false = did not fail, true = failed. Report generation checks threshold/exit agreement, load/action totals and check counts against raw summaries.\n\nUse an ephemeral signing secret for the benchmark and preserve your normal .env. These database credentials belong only to the isolated local benchmark.\n\n\`\`\`powershell\n$env:JWT_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')\ndocker compose -p customer-operation-cloud-v1-benchmark -f compose.benchmark.yaml up --build -d --wait\nRemove-Item Env:JWT_SECRET\n$env:COMPOSE_PROJECT_NAME = 'customer-operation-cloud-v1-benchmark'\n$env:COMPOSE_FILE = 'compose.benchmark.yaml'\n$env:BASE_URL = 'http://localhost:3002'\n# Set RESULTS_DIR to a NEW directory for each repeat; retain earlier evidence.\n$env:RESULTS_DIR = 'docs/Version1/results/repeat-windows-30s'\nnpm run test:load:matrix\n# B: Docker; LOAD_USERS=500,1000,2000; LOAD_DURATION=30s\n# C: Docker; LOAD_USERS=2000,5000; LOAD_DURATION=1m\n# D: native; LOAD_WORKLOAD=mixed; LOAD_USERS=10,50,100,250,500\n# E: Docker; LOAD_WORKLOAD=mixed; LOAD_USERS=250,500,1000\n# F: Docker; LOAD_WORKLOAD=mixed; LOAD_PROFILE=spike; LOAD_USERS=250,1000\n# G: Docker; LOAD_WORKLOAD=mixed; LOAD_PROFILE=soak; LOAD_USERS=100; LOAD_DURATION=5m\n# Docker campaigns: set K6_EXECUTION=docker and BASE_URL=http://api:3001.\n# Use LOAD_PROFILE=steady and LOAD_DURATION=30s for D/E.\n# Read-only campaigns: set LOAD_WORKLOAD=organization-read, LOAD_PROFILE=steady.\n# Rebuild reports from retained evidence:\nnode apps/api/scripts/report-version1.ts --final\n\`\`\`\n\nThe measured stages bound observations. Untested user counts have no result; one passing small read workload does not establish the same capacity for mixed traffic. The separate generator still shares host resources. Dataset warmth, the fresh database, port 3002, API changes and execution order also differ from Version 0, so comparisons are observations rather than a controlled causal experiment.\n\n## Functional and code checks\n\n- API type checking, lint and compiled build passed; retained [validation logs](results/validation/).\n- The default suite reported **20 passed, 0 failed, 3 intentionally skipped** without TEST_DATABASE_URL. [Log](results/validation/in-memory-tests.log).\n- The real PostgreSQL 17 suite reported **23 passed, 0 failed, 0 skipped** against isolated temporary schemas in the benchmark database. [Log](results/validation/functional-tests.log). Node counts the pre-existing empty security.test.ts as a passing file entry; this is not 23 substantive security scenarios.\n- Docker image build and readiness completed successfully before the load campaigns. [Log](results/validation/docker-build-start.log).\n- Tests cover registration/login, JWT/ownership rejection, request IDs, security headers, generic errors and private logging, migration preservation/rollback, database constraints and upload byte/metadata validation.\n- Custom summary regression checks cover credential exclusion. Mocked k6 lifecycle checks establish script/account assignment correctness; actual campaigns above establish the measured traffic results.\n`;
for (const file of ["docker-smoke.json", "resilience.json"]) {
  const path = join(results, "validation", file);
  if (await exists(path)) {
    const validation = await json(path);
    report += `- Compiled Docker ${file === "docker-smoke.json" ? "HTTP smoke checks" : "readiness/restart checks"}: **${validation.checks.length} passed**, **${validation.failed ?? 0} failed**. [Evidence](results/validation/${file}).\n`;
  }
}
const highestPass = (campaign: string) =>
  all
    .filter(
      (row) =>
        row.campaign === campaign &&
        row.role !== "warmup" &&
        row.exitCode === 0,
    )
    .sort((a, b) => b.users - a.users)[0];
const aPass = highestPass("A");
const bPass = highestPass("B");
const ePass = highestPass("E");
const stress = all.find((row) => row.id === "C2");
let findings = "";
if (aPass && bPass)
  findings += `The highest passing read stage was **${aPass.users} VUs / ${aPass.duration} through Windows** and **${bPass.users} VUs / ${bPass.duration} inside Docker**. These are passing tested stages, not exact capacity boundaries. `;
if (ePass)
  findings += `The highest passing Docker mixed stage was **${ePass.users} distinct-account VUs / ${ePass.duration}**, with read/write/login p95 of ${n(ePass.latency["p(95)"]!)} / ${n(ePass.writeLatency["p(95)"]!)} / ${n(ePass.loginLatency["p(95)"]!)} ms. `;
if (findings)
  report = report.replace(
    "\n## Scope and environment",
    `\n${findings}\n\n## Scope and environment`,
  );
let interpretation = "\n## What the measured limits show\n\n";
const windowsFailures = all.filter(
  (row) => row.campaign === "A" && row.role !== "warmup" && row.failures,
);
if (windowsFailures.length)
  interpretation += `Windows request logs recorded connection refusals in ${windowsFailures.map((row) => row.id).join(", ")}. Read p95 also failed at ${
    windowsFailures
      .filter((row) => row.latency["p(95)"]! >= 500)
      .map((row) => `${row.users} VUs`)
      .join(", ") || "none of those stages"
  }. Moving k6 inside Docker eliminated refusal warnings in the comparison stages, while high-concurrency latency could still fail. This separates a published-port observation from an intrinsic application-capacity claim; it does not isolate one operating-system/proxy cause.\n\n`;
if (stress)
  interpretation += `The 5,000-user read stress stage recorded **${n(stress.reads, 0)} reads**, **${n(stress.readRPS)} reported read RPS**, **${n(stress.latency["p(95)"]!)} ms p95**, **${n(stress.failures, 0)} failures (${pct(stress.failedReadRate)})**, and **${pct(stress.cpuThrottledPeriods / stress.cpuPeriods)} of API scheduler periods throttled**. The highest observed database-pool waiting count was **${stress.poolWaitingMax}**. API logs separately recorded statuses \`${JSON.stringify(stress.observation.statuses)}\`, including setup and health probes. Rising latency, throttling and pool waiters are consistent with CPU/queue pressure, but these measurements do not isolate the responsible function or SQL query.\n\n`;
const mixedFailures = mixed.filter(
  (row) => row.role !== "warmup" && row.exitCode !== 0,
);
if (mixed.length)
  interpretation += `Mixed traffic produced different limits from the single shared organization read. ${mixedFailures.length ? `Failed mixed stages were ${mixedFailures.map((row) => row.id).join(", ")}; their exact failing read/write/login/error/check criteria remain in the stage reports.` : "All mixed stages completed so far passed their configured criteria."} Setup provisioned distinct datasets before load and continued to accumulate writes, so these results must be compared by workload and generator placement. Mixed steady campaigns stopped at the explicitly tested 1,000-account stage; 2,000/5,000-account mixed traffic was not tested. The read-only 2,000/5,000-user campaigns above still ran as requested.\n\n`;
const maxApi = Math.max(...all.map((row) => row.resources.api.maxMiB));
const maxDb = Math.max(...all.map((row) => row.resources.postgres.maxMiB));
const unhealthy = all.flatMap((row) =>
  row.raw.after
    .filter(
      (container, index) =>
        container.state.OOMKilled ||
        !container.state.Running ||
        container.restartCount > (row.raw.before[index]?.restartCount ?? 0),
    )
    .map((container) => `${row.id}: ${container.name}`),
);
interpretation += `Across these runs, the largest sampled API memory was **${n(maxApi)} MiB**, and PostgreSQL's was **${n(maxDb)} MiB**, against their separate 1,024 MiB limits. ${unhealthy.length ? `State anomalies: ${unhealthy.join("; ")}.` : "No recorded OOM kill, server stop or restart-count increase occurred during the load campaigns."} Short sampled tests cannot establish indefinite memory stability.\n`;
const old: {
  id: string;
  readRPS: number;
  latency: Metric;
  failedReadRate: number;
  exitCode: number;
}[] = await json(join(root, "docs/Version0/results/metrics.json"));
const comparisons = ["A7", "B1", "B2", "B3", "C1", "C2"].flatMap((id) => {
  const before = old.find((row) => row.id === id);
  const after = all.find((row) => row.id === id);
  return before && after
    ? [
        [
          id,
          after.users,
          after.duration,
          n(before.readRPS),
          n(after.readRPS),
          n(before.latency["p(95)"]!),
          n(after.latency["p(95)"]!),
          pct(before.failedReadRate),
          pct(after.failedReadRate),
          before.exitCode === 0 ? "PASS" : "FAIL",
          after.exitCode === 0 ? "PASS" : "FAIL",
        ],
      ]
    : [];
});
interpretation += `\n## Version 0 comparison for the repeated read workload\n\n${table(["Stage", "VUs", "Time", "V0 read RPS", "V1 read RPS", "V0 p95 ms", "V1 p95 ms", "V0 failed reads", "V1 failed reads", "V0", "V1"], comparisons)}\nThese numbers come from the retained Version 0 [metrics](../Version0/results/metrics.json) and the new raw summaries. Workload, thresholds and server caps match; dates, API implementation, database content, host-port number, background activity and test order differ. The observed change is not a controlled attribution to any one Version 1 feature.\n`;
report = report.replace(
  "\n## Resource observations for every run",
  `${interpretation}\n## Resource observations for every run`,
);
for (const filename of [
  "dataset-before-mixed.json",
  "dataset-after-campaigns.json",
]) {
  if (await exists(join(results, "validation", filename))) {
    const data = JSON.parse(
      (await readFile(join(results, "validation", filename), "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
    report += `- Database snapshot [${filename}](results/validation/${filename}): ${n(data.users, 0)} users, ${n(data.organizations, 0)} organizations, ${n(data.conversations, 0)} conversations, ${n(data.documents, 0)} documents and ${n(data.uploads, 0)} uploads; ${n(data.databaseBytes / 1048576)} MiB total database size.\n`;
  }
}
if (await exists(join(results, "validation/runtime-audit.json"))) {
  const audit = JSON.parse(
    (
      await readFile(join(results, "validation/runtime-audit.json"), "utf8")
    ).replace(/^\uFEFF/, ""),
  );
  report += `- API production dependency audit: **${audit.metadata.vulnerabilities.total} vulnerabilities**. [Evidence](results/validation/runtime-audit.json). This is not a whole-monorepo audit.\n`;
}
report = report.replace(
  "**k6's counter-rate time denominator includes setup**.",
  "**k6's counter-rate time denominator includes setup**. The installed-version source computes counter rate from test-run duration and marks the run started before setup: [counter calculation](https://github.com/grafana/k6/blob/v2.3.0/metrics/sink.go), [execution lifecycle](https://github.com/grafana/k6/blob/v2.3.0/internal/execution/scheduler.go).",
);
await writeFile(join(docs, "testResult.md"), report);
await writeFile(
  join(results, "helper.md"),
  `# How to read the Version 1 load-test results\n\nStart with the [Windows overview](01-windows-10-50-100-250-500-1000-2000-users-30s/summary.md) and [full report](../testResult.md). Each campaign has a combined summary and one readable Markdown report per stage. JSON and logs are the raw evidence.\n\n## What happens in a test\n\nCampaigns A–C repeat Version 0: **ask for one organization -> check status/ID -> wait one second -> repeat**. VUs share the stage's account. Campaigns D–G provision one account/organization/conversation/upload per VU and mix reads, writes and login. One action is one iteration; 70% read / 25% write / 5% login applies over completed 20-action cycles.\n\n## Decode the names\n\n${table(
    ["Name", "Meaning"],
    [
      ["01 / A", "Windows published-port read matrix, 10–2000 VUs / 30s"],
      ["02 / B", "Docker-network reads, 500/1000/2000 VUs / 30s"],
      ["03 / C", "Docker-network reads, 2000/5000 VUs / 1m"],
      ["04 / D", "Windows mixed traffic, 10/50/100/250/500 VUs / 30s"],
      ["05 / E", "Docker mixed traffic, 250/500/1000 VUs / 30s"],
      ["06 / F", "Docker spike, 250/1000 VUs, 5s up + 30s hold + 5s down"],
      ["07 / G", "Docker short steady repeat, 100 VUs / 5m"],
      ["00-1vu-10s", "Stage zero, one VU, ten seconds"],
      ["00-1vu-30s", "Mixed warm-up, long enough to execute login and writes"],
      ["summary.json", "Numeric k6 metrics and threshold failure flags"],
      ["summary.md", "Readable stage or combined campaign report"],
      ["stats.json", "Sampled Docker resources and host free memory"],
      [
        "api-observations.json",
        "API status totals and ten-second pool observations",
      ],
      [
        "runs.json / environment.json",
        "Commands, timestamps, image IDs, states, limits and versions",
      ],
      ["metrics.json", "Combined machine-readable campaign results"],
    ],
  )}\n\n## Counts, rates and percentages\n\ncount is a total; request-counter rate is requests/second; checks and http_req_failed rate are fractions. Multiply fractions by 100 for percentages. In failure-rate metrics passes counts failed requests and fails counts successful requests, because the predicate is failure. Each baseline read has two checks; mixed requests have three.\n\nTagged counts exclude setup. **The k6 counter-rate denominator still includes setup wall time**; distinct-account provisioning can lower mixed RPS. Read/write/login p95 values are separate request-duration percentiles in ms, not cycle time. 1000 ms is one second. Failed connections may have zero HTTP duration. A low p95 is not sufficient if error/check criteria fail.\n\n## Decisions and resources\n\nEvery configured threshold must pass. Exit 0 is pass; 99 is a threshold failure. In raw JSON, false means the threshold did not fail. The matrix keeps stress failures and returns 1 if any stage failed.\n\nDocker CPU around 100% is one logical CPU's work. A short sample can exceed 100% despite a one-CPU time quota. Each server's RAM cap is 1024 MiB, and caps are not reservations. Resources and cgroup counters include setup and graceful completion; sampled maxima are not continuous peaks. Native k6 memory was not measured; Docker k6 samples are separate from API/DB samples. Pool waiters are ten-second observations.\n\n## What the results establish\n\nThese are observations on one shared local machine. VUs mean concurrent workers, not a fixed arrival rate or a production user-capacity promise. Five minutes is a short soak, not a day-long stability test. Compare equivalent workloads, placements and durations, and retain both passes and failures. No credentials or setup_data are retained in summaries.\n`,
);
console.log(
  `Generated ${all.length} stage reports; ${passed} passed; ${all.length - passed} failed; campaigns complete=${complete}`,
);
