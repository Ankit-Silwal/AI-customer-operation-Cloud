export interface Environment {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  poolMax: number;
  poolIdleTimeoutMs: number;
  poolConnectionTimeoutMs: number;
  poolQueryTimeoutMs: number;
}

export function readEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Environment {
  const databaseUrl = env.DATABASE_URL;
  const jwtSecret = env.JWT_SECRET;
  const port = Number(env.PORT ?? 3001);
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  const integer = (name: string, fallback: number, max: number): number => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`${name} must be an integer between 1 and ${max}`);
    }
    return value;
  };
  return {
    port, databaseUrl, jwtSecret,
    poolMax: integer("DB_POOL_MAX", 10, 100),
    poolIdleTimeoutMs: integer("DB_POOL_IDLE_TIMEOUT_MS", 30000, 600000),
    poolConnectionTimeoutMs: integer("DB_POOL_CONNECTION_TIMEOUT_MS", 3000, 60000),
    poolQueryTimeoutMs: integer("DB_POOL_QUERY_TIMEOUT_MS", 5000, 60000),
  };
}
