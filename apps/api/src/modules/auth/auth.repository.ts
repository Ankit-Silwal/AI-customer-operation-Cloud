import type { Pool } from "pg";
import type { User, UserWithPassword } from "./auth.types.js";

export interface AuthRepository {
  create(name: string, email: string, passwordHash: string): Promise<User>;
  findByEmail(email: string): Promise<UserWithPassword | undefined>;
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly db: Pool) {}

  async create(
    name: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const { rows } = await this.db.query<User>(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at AS "createdAt"`,
      [name, email, passwordHash],
    );
    const user = rows[0];
    if (!user) throw new Error("User insert did not return a row");
    return user;
  }

  async findByEmail(email: string): Promise<UserWithPassword | undefined> {
    const { rows } = await this.db.query<UserWithPassword>(
      `SELECT id, name, email, password_hash AS "passwordHash", created_at AS "createdAt"
       FROM users WHERE email = $1`,
      [email],
    );
    return rows[0];
  }
}
