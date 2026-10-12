export interface LogRecord {
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  code?: string;
  poolTotal?: number;
  poolIdle?: number;
  poolWaiting?: number;
}

export type Logger = (record: LogRecord) => void;

// Callers supply only allowlisted operational fields, never bodies/headers/SQL.
export const jsonLogger: Logger = (record) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...record }));
};

export function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)) {
      return error.code;
    }
  }
  return "UNEXPECTED_ERROR";
}
