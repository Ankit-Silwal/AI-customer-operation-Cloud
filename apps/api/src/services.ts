export const serviceRoles = ["all", "core", "identity", "organizations", "conversations", "documents"] as const;
export type ServiceRole = (typeof serviceRoles)[number];
export type DatabaseRole = Exclude<ServiceRole, "all" | "core">;

export function readServiceRole(value = "all"): ServiceRole {
  if (!serviceRoles.includes(value as ServiceRole)) throw new Error("Invalid SERVICE_ROLE");
  return value as ServiceRole;
}
