import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { prisma } from './db.js';
import { sendVerificationEmail } from './email.js';

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
  throw new Error('Set BETTER_AUTH_SECRET to a random value of at least 32 characters.');
export const appOrigin = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin;
export const auth = betterAuth({
  appName: 'Relay',
  baseURL: appOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [appOrigin],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    autoSignIn: false,
  },
  emailVerification: {
    sendVerificationEmail,
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
  },
  rateLimit: {
    enabled: true,
    customRules: { '/send-verification-email': { window: 60, max: 3 } },
  },
  account: { accountLinking: { enabled: false } },
});
