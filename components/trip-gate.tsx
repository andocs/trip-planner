"use client";

import { Loader2, MapPinned, Sparkles } from "lucide-react";
import { createContext, use, type ReactNode } from "react";
import { toast } from "sonner";
import { ClaimTrip } from "@/components/gate/claim-trip";
import { InviteOnly } from "@/components/gate/invite-only";
import { NoAccess } from "@/components/gate/no-access";
import { Board } from "@/components/ui/board";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadExample } from "@/lib/queries/trip-actions";
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
import { useRealtimeSync } from "@/lib/realtime";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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

/** Loads the session and active trip, then shows the right access state before rendering children. */
export function TripGate({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  return <TripGateInner>{children}</TripGateInner>;
}

function TripGateInner({ children }: { children: ReactNode }) {
  const user = useUser();
  const trip = useActiveTrip();
  const admin = useIsAdmin();

  if (user.isError) return <ErrorState message={errorMessage(user.error)} onRetry={() => user.refetch()} />;
  if (!user.isSuccess) return <PageSkeleton />;
  if (!user.data) return <InviteOnly />;
  if (trip.isError) return <ErrorState message={errorMessage(trip.error)} onRetry={() => trip.refetch()} />;
  if (!trip.isSuccess || (!user.data.isAnonymous && !admin.isFetched)) return <PageSkeleton />;

  if (!trip.data) {
    return admin.data ? <OwnerWithoutTrip /> : <NoAccess email={user.data.email} />;
  }
  return (
    <TripRole trip={trip.data} isAdmin={admin.data === true} email={user.data.email}>
      {children}
    </TripRole>
  );
}

function TripRole({
  trip,
  isAdmin,
  email,
  children,
}: {
  trip: Trip;
  isAdmin: boolean;
  email: string | null;
  children: ReactNode;
}) {
  const role = useTripRole(trip.id);
  if (role.isError) return <ErrorState message={errorMessage(role.error)} onRetry={() => role.refetch()} />;
  if (!role.isSuccess) return <PageSkeleton />;
  if (!role.data) return <NoAccess email={email} />;
  // An owner row only counts while the account is still an admin (the database applies the same rule).
  const canEdit = role.data === "editor" || (role.data === "owner" && isAdmin);
  return (
    <TripContext value={{ trip, role: role.data, canEdit }}>
      <RealtimeSync tripId={trip.id} />
      {children}
    </TripContext>
  );
}

function RealtimeSync({ tripId }: { tripId: string }) {
  useRealtimeSync(tripId);
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
  return <NoTrip />;
}

function NoTrip() {
  const create = useCreateTrip();
  const loadExample = useLoadExample();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <Board value="0" size="lg" className="mb-6" />
      <h1 className="text-2xl font-bold">Where to next?</h1>
      <p className="mt-2 max-w-xs text-fg-muted">
        Start a trip, then share the invite link so your travel buddies can follow along.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button
          size="lg"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(undefined, { onError: (e) => toast.error(`Couldn't create the trip: ${errorMessage(e)}`) })
          }
        >
          {create.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <MapPinned className="size-5" aria-hidden />
          )}
          Create a trip
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={loadExample.isPending || create.isPending}
          onClick={() => loadExample.mutate()}
        >
          {loadExample.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-5" aria-hidden />
          )}
          Load the Vietnam &rsquo;26 example
        </Button>
      </div>
    </div>
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
