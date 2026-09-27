import type { UserRole } from "@/db/schema";

/** The authenticated principal passed to every service call (framework-independent). */
export interface Actor {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
  ip: string | null;
  userAgent: string | null;
}

export const STAFF_ROLES: readonly UserRole[] = ["staff", "admin"];

export function isStaff(actor: Pick<Actor, "role">): boolean {
  return STAFF_ROLES.includes(actor.role);
}

export function normalizeRole(role: unknown): UserRole {
  return role === "admin" || role === "staff" ? role : "customer";
}
