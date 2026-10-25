import type { Pool } from "pg";
import { createDatabase } from "./database.js";
import type { Environment } from "./env.js";
import { HttpError } from "./http.js";
import { errorCode, jsonLogger, type Logger } from "./logger.js";

// Reads that tolerate bounded replication lag (lists, searches, counts) go through a ReadSource.
// Point lookups, ownership checks and read-after-write paths must keep using the primary client.
export interface ReadSource<C> {
  read<T>(query: (db: C) => Promise<T>): Promise<T>;
}

export function primaryOnly<C>(db: C): ReadSource<C> {
  return { read: (query) => query(db) };
}

export function parseReadUrls(value: string | undefined, name = "DATABASE_READ_URLS"): string[] {
  const urls = (value ?? "").split(",").map((url) => url.trim()).filter(Boolean);
  for (const url of urls)
    if (!/^postgres(?:ql)?:\/\//.test(url)) throw new Error(`${name} must contain PostgreSQL connection URLs`);
  return urls;
}

// "16/B374D848" -> comparable 64-bit WAL position.
function walPosition(value: string): bigint {
  const [high = "0", low = "0"] = value.split("/");
  return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
}

interface Replica<C> {
  index: number;
  pool: Pool;
  client: C;
  healthy: boolean;
  failures?: number;
  retryAt?: number | undefined;
}

const maxBackoffMs = 30_000;

export class ReadReplicas<C extends { $disconnect(): Promise<void> }> implements ReadSource<C> {
  private next = 0;
  private previousPrimary?: bigint;
  private inFlight?: Promise<void> | undefined;
  private readonly timer?: NodeJS.Timeout;

  constructor(
    private readonly primaryPool: Pool,
    private readonly primary: C,
    private readonly replicas: Replica<C>[],
    private readonly logger: Logger = jsonLogger,
    private readonly intervalMs = 1000,
  ) {
    if (!replicas.length) return;
    this.timer = setInterval(() => void this.check(), intervalMs);
    this.timer.unref();
    void this.check();
  }

  // A replica is used only after it has replayed everything the primary had written one
  // interval earlier, so staleness stays bounded to roughly two intervals. Replicas start
  // unhealthy and every read falls back to the primary until the first check passes.
  check(): Promise<void> {
    // Never overlap checks: a dead replica's connect attempts would otherwise pile up.
    return (this.inFlight ??= this.checkOnce().finally(() => {
      this.inFlight = undefined;
    }));
  }

  private async checkOnce(): Promise<void> {
    let current: bigint;
    try {
      const { rows } = await this.primaryPool.query<{ lsn: string }>("SELECT pg_current_wal_lsn()::text AS lsn");
      current = walPosition(rows[0]!.lsn);
    } catch {
      // Without the primary position lag is unknown; keep the last verdict so reads stay available.
      return;
    }
    const required = this.previousPrimary ?? current;
    this.previousPrimary = current;
    const now = Date.now();
    await Promise.all(this.replicas.map(async (replica) => {
      // Unreachable replicas are probed with exponential backoff. A stopped container's name
      // stops resolving and lookups fall through to slower DNS, so constant probing would tie up
      // the libuv threadpool that every other DNS lookup in this process shares.
      if (replica.retryAt && now < replica.retryAt) return;
      let healthy = false;
      let reachable = false;
      try {
        const { rows } = await replica.pool.query<{ recovery: boolean; lsn: string | null }>(
          "SELECT pg_is_in_recovery() AS recovery, pg_last_wal_replay_lsn()::text AS lsn",
        );
        reachable = true;
        const row = rows[0];
        healthy = Boolean(row?.recovery && row.lsn && walPosition(row.lsn) >= required);
      } catch { /* unreachable replicas stay out of rotation */ }
      replica.failures = reachable ? 0 : (replica.failures ?? 0) + 1;
      replica.retryAt = reachable ? undefined : now + Math.min(maxBackoffMs, this.intervalMs * 2 ** replica.failures);
      this.mark(replica, healthy);
    }));
  }

  private mark(replica: Replica<C>, healthy: boolean, code?: string): void {
    if (replica.healthy !== healthy)
      this.logger({ level: healthy ? "info" : "warn", event: "read_replica_health", replica: replica.index, healthy, ...(code ? { code } : {}) });
    replica.healthy = healthy;
  }

  healthyCount(): number {
    return this.replicas.filter((replica) => replica.healthy).length;
  }

  async read<T>(query: (db: C) => Promise<T>): Promise<T> {
    const healthy = this.replicas.filter((replica) => replica.healthy);
    if (!healthy.length) return query(this.primary);
    const replica = healthy[this.next++ % healthy.length]!;
    try {
      return await query(replica.client);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Includes recovery-conflict cancellations (40001) and lost connections.
      this.mark(replica, false, errorCode(error));
      return query(this.primary);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    try {
      await Promise.all(this.replicas.map((replica) => replica.client.$disconnect()));
    } finally {
      await Promise.all(this.replicas.map((replica) => replica.pool.end()));
    }
  }
}

export function createReadReplicas<C extends { $disconnect(): Promise<void> }>(
  primaryPool: Pool,
  primary: C,
  urls: string[],
  createClient: (pool: Pool) => C,
  settings?: Pick<Environment, "poolMax" | "poolIdleTimeoutMs" | "poolConnectionTimeoutMs" | "poolQueryTimeoutMs">,
  logger: Logger = jsonLogger,
): ReadReplicas<C> {
  // A dead replica must cost a read at most ~1 s before it falls back to the primary.
  const replicaSettings = settings && { ...settings, poolConnectionTimeoutMs: Math.min(settings.poolConnectionTimeoutMs, 1000) };
  const replicas = urls.map((url, index) => {
    const pool = createDatabase(url, replicaSettings ?? { poolMax: 10, poolIdleTimeoutMs: 30000, poolConnectionTimeoutMs: 1000, poolQueryTimeoutMs: 5000 }, logger);
    return { index, pool, client: createClient(pool), healthy: false };
  });
  return new ReadReplicas(primaryPool, primary, replicas, logger);
}
