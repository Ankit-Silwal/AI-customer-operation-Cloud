import nodemailer from "nodemailer";
import { HttpError } from "./http.js";

export function smtpMailer(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  const from = env.SMTP_FROM?.trim();
  if (!env.SMTP_HOST || !from) return undefined;
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    /[\r\n]/.test(from) ||
    Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)
  )
    throw new Error("Invalid SMTP configuration");
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && env.SMTP_REQUIRE_TLS !== "false",
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
      : {}),
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
    dnsTimeout: 3000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return async (email: string, code: string): Promise<void> => {
    try {
      const result = await transport.sendMail({
        from,
        to: { address: email, name: "" },
        subject: "Your Hearth verification code",
        text: `Your verification code is ${code}. It expires in 5 minutes. If you did not request this code, ignore this email. Never share it with anyone.`,
      });
      if (!result.accepted?.length) throw new Error("Not accepted");
    } catch {
      throw new HttpError(503, "Email delivery temporarily unavailable", "5");
    }
  };
}
