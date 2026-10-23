import type { PrismaClient } from "../../database/prisma.js";
import type { User, UserWithPassword } from "./auth.types.js";

export interface AuthRepository {
  create(name: string, email: string, passwordHash: string): Promise<User>;
  findByEmail(email: string): Promise<UserWithPassword | undefined>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(
    name: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    return this.db.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  async findByEmail(email: string): Promise<UserWithPassword | undefined> {
    return (await this.db.user.findUnique({ where: { email } })) ?? undefined;
  }
}
