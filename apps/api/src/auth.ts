import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { prisma } from './db.js';

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
  throw new Error('Set BETTER_AUTH_SECRET to a random value of at least 32 characters.');
export const appOrigin = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin;
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
export const auth = betterAuth({
  appName: 'Relay',
  baseURL: appOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [appOrigin],
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},
  account: { accountLinking: { enabled: false } },
});
