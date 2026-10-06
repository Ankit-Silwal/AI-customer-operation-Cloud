import type { Pool } from "pg";
import type { Organization } from "./organization.types.js";

export interface OrganizationRepository {
  create(name: string, ownerId: string): Promise<Organization>;
  findOwnedById(id: string, ownerId: string): Promise<Organization | undefined>;
}

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: Pool) {}

  async create(name: string, ownerId: string): Promise<Organization> {
    const { rows } = await this.db.query<Organization>(
      `INSERT INTO organizations (name, owner_id) VALUES ($1, $2)
       RETURNING id, name, owner_id AS "ownerId", created_at AS "createdAt"`,
      [name, ownerId],
    );
    const organization = rows[0];
    if (!organization)
      throw new Error("Organization insert did not return a row");
    return organization;
  }

  async findOwnedById(
    id: string,
    ownerId: string,
  ): Promise<Organization | undefined> {
    const { rows } = await this.db.query<Organization>(
      `SELECT id, name, owner_id AS "ownerId", created_at AS "createdAt"
       FROM organizations WHERE id = $1 AND owner_id = $2`,
      [id, ownerId],
    );
    return rows[0];
  }
}
