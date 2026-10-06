export interface Environment {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
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
  return { port, databaseUrl, jwtSecret };
}
