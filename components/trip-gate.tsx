"use client";

import { Loader2, MapPinned, Plane, Sparkles } from "lucide-react";
import { createContext, use, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveTrip, useCreateTrip, useUserId, type Trip } from "@/lib/queries/trip";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { errorMessage } from "@/lib/utils";

const TripContext = createContext<Trip | null>(null);

/** The active trip. Only call inside <TripGate>. */
export function useTrip(): Trip {
  const trip = use(TripContext);
  if (!trip) throw new Error("useTrip must be used inside <TripGate>");
  return trip;
}

/** Signs in (anonymously), loads the active trip, and shows setup / empty / error states before rendering children. */
export function TripGate({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  return <TripGateInner>{children}</TripGateInner>;
}

function TripGateInner({ children }: { children: ReactNode }) {
  const user = useUserId();
  const trip = useActiveTrip();

  if (user.isError) return <ErrorState message={errorMessage(user.error)} onRetry={() => user.refetch()} />;
  if (trip.isError) return <ErrorState message={errorMessage(trip.error)} onRetry={() => trip.refetch()} />;
  if (!trip.isSuccess) return <PageSkeleton />;
  if (!trip.data) return <NoTrip />;

  return <TripContext value={trip.data}>{children}</TripContext>;
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

function NoTrip() {
  const create = useCreateTrip();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <span className="mb-6 grid size-20 place-items-center rounded-3xl bg-navy text-white shadow-card" aria-hidden>
        <Plane className="size-10" />
      </span>
      <h1 className="text-2xl font-bold">Where to next?</h1>
      <p className="mt-2 max-w-xs text-fg-muted">
        Start a trip, then share the invite link so your travel buddies can plan with you.
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
        <Button size="lg" variant="secondary" disabled title="Available in a later milestone">
          <Sparkles className="size-5" aria-hidden />
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
