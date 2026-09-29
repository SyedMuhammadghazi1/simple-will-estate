import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@/db/schema";
import { normalizeRole, type Actor } from "./actor";
import { getAuth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { authHeaders, requestMeta } from "./request";

export { isStaff, STAFF_ROLES, type Actor } from "./actor";

export async function actorFromHeaders(h: Headers): Promise<Actor | null> {
  const session = await getAuth().api.getSession({ headers: authHeaders(h) });
  if (!session) return null;
  const meta = requestMeta(h);
  const u = session.user as typeof session.user & { role?: unknown };
  return {
    userId: u.id,
    role: normalizeRole(u.role),
    email: u.email,
    name: u.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

/** Current actor for server components/actions, or null. */
export async function getActor(): Promise<Actor | null> {
  return actorFromHeaders(await headers());
}

/** Pages & server actions: redirects anonymous users to sign in. */
export async function requireUser(nextPath?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in");
  }
  return actor;
}

/** Pages & server actions: requires one of `roles`; other signed-in users get a 404. */
export async function requireRole(roles: readonly UserRole[], nextPath?: string): Promise<Actor> {
  const actor = await requireUser(nextPath);
  if (!roles.includes(actor.role)) notFound();
  return actor;
}

/** Route handlers: throws typed errors instead of redirecting. */
export async function requireApiActor(req: Request, roles?: readonly UserRole[]): Promise<Actor> {
  const actor = await actorFromHeaders(req.headers);
  if (!actor) throw new UnauthorizedError();
  if (roles && !roles.includes(actor.role)) throw new ForbiddenError();
  return actor;
}
