export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
}
