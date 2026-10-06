import { HttpError } from "../../common/http.js";
import type { OrganizationRepository } from "./organization.repository.js";
import type {
  CreateOrganizationInput,
  Organization,
} from "./organization.types.js";

export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  create(
    input: CreateOrganizationInput,
    ownerId: string,
  ): Promise<Organization> {
    return this.repository.create(input.name, ownerId);
  }

  async getById(id: string, ownerId: string): Promise<Organization> {
    const organization = await this.repository.findOwnedById(id, ownerId);
    if (!organization) throw new HttpError(404, "Organization not found");
    return organization;
  }
}
