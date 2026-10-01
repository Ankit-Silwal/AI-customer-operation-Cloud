import nodemailer from 'nodemailer';

const production = process.env.NODE_ENV === 'production';
const host = process.env.SMTP_HOST || (production ? '' : '127.0.0.1');
const from = process.env.EMAIL_FROM || (production ? '' : 'Relay <no-reply@relay.local>');
if (!host || !from)
  throw new Error('Set SMTP_HOST and EMAIL_FROM for verification email delivery.');
const port = Number(process.env.SMTP_PORT || (production ? 587 : 1025));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('SMTP_PORT must be a valid port number.');
if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD))
  throw new Error('Set both SMTP_USER and SMTP_PASSWORD for authenticated SMTP.');

const transport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
  requireTLS: production,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD! }
    : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  disableFileAccess: true,
  disableUrlAccess: true,
});

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}) {
  await transport.sendMail({
    from,
    to: user.email,
    subject: 'Verify your Relay email address',
    text: `Welcome to Relay!\n\nVerify your email address to access your workspace:\n${url}\n\nThis link expires in 1 hour. If you did not request this email, you can ignore it.`,
  });
}
