import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required. Copy apps/api/.env.example to apps/api/.env.');
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
