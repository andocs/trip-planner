"use client";

import { createContext, use, useEffect, useRef, type ReactNode } from "react";
import { ClaimTrip } from "@/components/gate/claim-trip";
import { InviteOnly } from "@/components/gate/invite-only";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { NoAccess } from "@/components/gate/no-access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
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
import { decideAccess } from "@/lib/access";
import type { Bootstrap } from "@/lib/queries/bootstrap";
import { useRealtimeSync, useWarmCache } from "@/lib/realtime";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useClientValue } from "@/lib/use-client-value";
import { errorMessage } from "@/lib/utils";

/**
 * The owner's setup wizard, loaded only when a draft trip needs it (about 10 KB of JavaScript that no other screen uses).
 * Rendered in the browser only, so the server HTML and the first client render are both the skeleton.
 */
const Wizard = dynamic(() => import("@/components/wizard/wizard").then((m) => m.Wizard), { ssr: false, loading: () => <PageSkeleton /> });

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
 * What is shown is decided by `decideAccess` (lib/access.ts), the only place those rules live. `prefetched` says the
 * server already put the trip in the HTML, and `boot` is the server's own answer: until the page has mounted only that
 * answer may be used (and a skeleton when there is none), because the first client render must match the server HTML.
 * Rendering from the browser's cache earlier caused hydration mismatches. After mounting, the live queries decide.
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
  const role = useTripRole(trip.data?.id); // off until a trip is known
  const mounted = useClientValue(() => true, false);

  // One decision (lib/access.ts) from the server's snapshot or the live queries, one switch to show it.
  const access = decideAccess({ mounted, prefetched, boot, user, trip, admin, role });
  switch (access.kind) {
    case "loading":
      return <PageSkeleton />;
    case "error": {
      const failing = access.source === "user" ? user : access.source === "trip" ? trip : role;
      return <ErrorState message={access.message} onRetry={() => failing.refetch()} />;
    }
    case "signed-out":
      return <InviteOnly />;
    case "no-trip":
      return <OwnerWithoutTrip />;
    case "no-access":
      return <NoAccess email={access.email} />;
    case "ready":
      // The key makes the screen mount afresh once the page is live, on purpose (the old gate did this too, by accident of
      // having two component types). Parts of a streamed page hydrate AFTER the first effects, reading the browser's cache
      // instead of what the server sent, and several screens still do (Settings' time zone labels and Account card were
      // caught in a real-build test). Mounting afresh renders them in the browser instead of comparing them with the HTML,
      // so nothing is reported. Removing the key is possible, but only after each screen is made hydration-safe:
      // run `npm run check:real-build` with it removed to see what is left.
      return (
        <TripShell key={mounted ? "live" : "snapshot"} trip={access.trip} role={access.role} canEdit={access.canEdit}>
          {children}
        </TripShell>
      );
  }
}

/** The signed-in, allowed-in screen: the owner's setup wizard while the trip is a draft, otherwise the app. */
function TripShell({ trip, role, canEdit, children }: { trip: Trip; role: Role; canEdit: boolean; children: ReactNode }) {
  const value = { trip, role, canEdit };
  // A draft is the owner's setup wizard; viewers wait until it is finished.
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
