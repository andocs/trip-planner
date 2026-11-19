import type { AppUser, Bootstrap, Role, Trip } from "@/lib/queries/bootstrap";
import { errorMessage } from "@/lib/utils";

/**
 * Who may see what, decided in one place. Pure: no React, no network, so every branch is unit-tested.
 *
 * The gate has two sources for the same question. The SERVER SNAPSHOT (`boot`) is what the first HTML was built from; the
 * browser's own queries are what is true afterwards. Until the page has mounted, only the snapshot may be used: the browser's
 * cache is not a safe source for the first render (a streamed page hydrates after the first effects), and rendering from it
 * produced hydration mismatches. After mounting, the live answers win. Both go through this one function, so there is one
 * set of rules, and the screen that is shown does not change type when the page mounts (which used to remount the whole page).
 */

/** The part of a TanStack query result the decision reads. */
export type Answer<T> = {
  data: T | undefined;
  isError: boolean;
  isSuccess: boolean;
  isFetched: boolean;
  error: unknown;
};

export type AccessInput = {
  /** False on the server and while hydrating; true from the first effect on. */
  mounted: boolean;
  /** True when the server prefetched for this request (the HTML already holds the page). */
  prefetched: boolean;
  /** The server's own answer, when it prefetched. */
  boot?: Bootstrap;
  user: Answer<AppUser | null>;
  trip: Answer<Trip | null>;
  admin: Answer<boolean>;
  /** The role on the live trip (a query that is off until a trip is known). */
  role: Answer<Role | null>;
};

export type Access =
  | { kind: "loading" }
  | { kind: "error"; message: string; source: "user" | "trip" | "role" }
  | { kind: "signed-out" }
  /** Signed in, but with no trip: the owner starts or claims one; anyone else has no access. */
  | { kind: "no-trip"; email: string | null; isAdmin: boolean }
  | { kind: "no-access"; email: string | null }
  | { kind: "ready"; trip: Trip; role: Role; canEdit: boolean };

/** An owner row only counts while the account is still an admin (the database applies the same rule). */
export const canEditAs = (role: Role, isAdmin: boolean) => role === "editor" || (role === "owner" && isAdmin);

/** An archived trip opens read-only for everyone, owner included, until it is restored. */
const ready = (trip: Trip, role: Role | null | undefined, isAdmin: boolean, email: string | null): Access =>
  role ? { kind: "ready", trip, role, canEdit: canEditAs(role, isAdmin) && !trip.archived_at } : { kind: "no-access", email };

export function decideAccess(i: AccessInput): Access {
  // No snapshot and not mounted: the server sent a skeleton, so the first client render must be one too.
  if (!i.prefetched && !i.mounted) return { kind: "loading" };

  // Hydrating a prefetched page: the snapshot, and only the snapshot.
  if (!i.mounted && i.boot) {
    const b = i.boot;
    if (!b.trip) return b.isAdmin ? { kind: "no-trip", email: b.user.email, isAdmin: true } : { kind: "no-access", email: b.user.email };
    return ready(b.trip, b.role, b.isAdmin, b.user.email);
  }

  // From here on the live answers decide. An answer already held (loaded earlier, or the offline copy) beats a failed
  // refresh: a failed refetch must not replace a working screen with an error. Only "no answer at all" is an error or a wait.
  const { user, trip, admin, role } = i;
  if (user.isError && user.data === undefined) return { kind: "error", message: errorMessage(user.error), source: "user" };
  if (!user.isSuccess && user.data === undefined) return { kind: "loading" };
  if (!user.data) return { kind: "signed-out" };

  if (trip.isError && trip.data === undefined) return { kind: "error", message: errorMessage(trip.error), source: "trip" };
  const adminPending = !user.data.isAnonymous && !admin.isFetched && admin.data === undefined;
  if ((!trip.isSuccess && trip.data === undefined) || adminPending) return { kind: "loading" };

  if (!trip.data) {
    return admin.data ? { kind: "no-trip", email: user.data.email, isAdmin: true } : { kind: "no-access", email: user.data.email };
  }

  if (role.isError && role.data === undefined) return { kind: "error", message: errorMessage(role.error), source: "role" };
  if (!role.isSuccess && role.data === undefined) return { kind: "loading" };
  return ready(trip.data, role.data, admin.data === true, user.data.email);
}
