"use client";

import { createContext, use, useEffect, useRef, type ReactNode } from "react";
import { ClaimTrip } from "@/components/gate/claim-trip";
import { InviteOnly } from "@/components/gate/invite-only";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { NoAccess } from "@/components/gate/no-access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wizard } from "@/components/wizard/wizard";
import {
  useActiveTrip,
  useClaimableTrips,
  useCreateTrip,
  useIsAdmin,
  useTripRole,
  useUser,
  type Role,
  type Trip,
} from "@/lib/queries/trip";
import type { Bootstrap } from "@/lib/queries/bootstrap";
import { useRealtimeSync, useWarmCache } from "@/lib/realtime";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useClientValue } from "@/lib/use-client-value";
import { errorMessage } from "@/lib/utils";

type TripAccess = { trip: Trip; role: Role; canEdit: boolean };
const TripContext = createContext<TripAccess | null>(null);

function useAccess(): TripAccess {
  const a = use(TripContext);
  if (!a) throw new Error("useTrip must be used inside <TripGate>");
  return a;
}

/** The active trip. Only call inside <TripGate>. */
export function useTrip(): Trip {
  return useAccess().trip;
}

/** The caller's role on the active trip. */
export function useRole(): Role {
  return useAccess().role;
}

/** True only for the owner (and a future editor). Everyone else is read-only. The database enforces this too. */
export function useCanEdit(): boolean {
  return useAccess().canEdit;
}

/** Renders its children for people who can edit; viewers get no control at all (never a dead button). */
export function EditOnly({ children }: { children: ReactNode }) {
  return useCanEdit() ? children : null;
}

/**
 * Loads the session and active trip, then shows the right access state before rendering children.
 *
 * `prefetched` says the server already put the trip in the HTML (cold-load prefetch). When it did not,
 * the server HTML is a skeleton, so the first client render must be one too: the shell's own queries may
 * have filled the cache before this part of the page hydrates, and rendering real content then would
 * not match the HTML (and can leave the page stuck on its skeleton).
 */
export function TripGate({
  children,
  prefetched = false,
  boot,
}: {
  children: ReactNode;
  prefetched?: boolean;
  /** The server's own answer (user, trip, admin flag, role), when it prefetched. */
  boot?: Bootstrap;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  return (
    <TripGateInner prefetched={prefetched} boot={boot}>
      {children}
    </TripGateInner>
  );
}

function TripGateInner({ children, prefetched, boot }: { children: ReactNode; prefetched: boolean; boot?: Bootstrap }) {
  const user = useUser();
  const trip = useActiveTrip();
  const admin = useIsAdmin();
  const mounted = useClientValue(() => true, false);

  if (!prefetched && !mounted) return <PageSkeleton />;

  // The server HTML was built from `boot`. The browser's query cache is NOT a safe source for the first render: the
  // app shell (outside this boundary) has already created the user and trip queries there, still empty, and a
  // dehydrated query that already exists is only filled in an effect. Rendering from the cache would sometimes show a
  // skeleton where the server sent the page (or the reverse): a hydration mismatch. So until mounted, use `boot`.
  const snap = !mounted && boot ? boot : null;
  if (snap) return <Ready boot={snap}>{children}</Ready>;

  // An answer we already hold (loaded earlier, or the offline copy) beats a failed refresh: a failed refetch must not
  // replace a working screen with an error. Only "no answer at all" is an error or a skeleton.
  const userKnown = user.data !== undefined;
  const tripKnown = trip.data !== undefined;
  if (user.isError && !userKnown) return <ErrorState message={errorMessage(user.error)} onRetry={() => user.refetch()} />;
  if (!user.isSuccess && !userKnown) return <PageSkeleton />;
  if (!user.data) return <InviteOnly />;
  if (trip.isError && !tripKnown) return <ErrorState message={errorMessage(trip.error)} onRetry={() => trip.refetch()} />;
  if ((!trip.isSuccess && !tripKnown) || (!user.data.isAnonymous && !admin.isFetched && admin.data === undefined)) return <PageSkeleton />;

  if (!trip.data) {
    return admin.data ? <OwnerWithoutTrip /> : <NoAccess email={user.data.email} />;
  }
  return (
    <TripRole trip={trip.data} isAdmin={admin.data === true} email={user.data.email}>
      {children}
    </TripRole>
  );
}

/** The gate's decision from the server's snapshot alone (same branches as the live path, no queries). */
function Ready({ boot, children }: { boot: Bootstrap; children: ReactNode }) {
  if (!boot.trip) return boot.isAdmin ? <OwnerWithoutTrip /> : <NoAccess email={boot.user.email} />;
  return (
    <TripRole trip={boot.trip} isAdmin={boot.isAdmin} email={boot.user.email} bootRole={boot.role}>
      {children}
    </TripRole>
  );
}

function TripRole({
  trip,
  isAdmin,
  email,
  bootRole,
  children,
}: {
  trip: Trip;
  isAdmin: boolean;
  email: string | null;
  /** The server's answer for the first render (see TripGateInner); undefined once the live query takes over. */
  bootRole?: Role | null;
  children: ReactNode;
}) {
  const role = useTripRole(trip.id);
  const fromServer = bootRole !== undefined;
  if (!fromServer && role.isError) return <ErrorState message={errorMessage(role.error)} onRetry={() => role.refetch()} />;
  if (!fromServer && !role.isSuccess) return <PageSkeleton />;
  const roleData = fromServer ? bootRole : role.data;
  if (!roleData) return <NoAccess email={email} />;
  // An owner row only counts while the account is still an admin (the database applies the same rule).
  const canEdit = roleData === "editor" || (roleData === "owner" && isAdmin);
  // A draft is the owner's setup wizard; viewers wait until it is finished.
  const value = { trip, role: roleData, canEdit };
  if (trip.status === "draft") {
    return canEdit ? (
      <TripContext value={value}>
        <Wizard trip={trip} />
      </TripContext>
    ) : (
      <SettingUp />
    );
  }
  return (
    <TripContext value={value}>
      <RealtimeSync tripId={trip.id} />
      {children}
    </TripContext>
  );
}

function RealtimeSync({ tripId }: { tripId: string }) {
  useRealtimeSync(tripId);
  useWarmCache(tripId);
  return null;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

/** The owner has no trip yet: claim an old one, or start a new one. */
function OwnerWithoutTrip() {
  const claimable = useClaimableTrips(true);
  if (claimable.isLoading) return <PageSkeleton />;
  if (claimable.data?.length) return <ClaimTrip />;
  return <StartWizard />;
}

/** First run for the owner: start a draft trip and open the wizard. */
function StartWizard() {
  const create = useCreateTrip();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    create.mutate(undefined);
  }, [create]);
  if (create.isError)
    return <ErrorState message={errorMessage(create.error)} onRetry={() => create.mutate(undefined)} />;
  return <PageSkeleton />;
}

/** What viewers see while the owner is setting up a new trip. */
function SettingUp() {
  return (
    <GateLayout>
      <h1 className={gateTitle}>Almost ready</h1>
      <p className="text-fg-muted">The trip owner is setting up the next trip. Check back soon.</p>
    </GateLayout>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-16 max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-card"
    >
      <h1 className="text-lg font-bold">Can&rsquo;t reach the trip</h1>
      <p className="mt-2 text-sm text-fg-muted">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h1 className="text-lg font-bold">Connect Supabase</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart the dev server.
      </p>
    </div>
  );
}
