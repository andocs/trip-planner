"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/trip-gate";
import { Skeleton } from "@/components/ui/skeleton";
import type { Place } from "@/app/api/geocode/route";
import { StepNights, StepWhere } from "@/components/wizard/steps-map";
import { StepMoney, StepReview, StepWhen, StepWho } from "@/components/wizard/steps-details";
import { useRows } from "@/lib/queries/table";
import { useUser, type Trip } from "@/lib/queries/trip";
import { getSupabase } from "@/lib/supabase/client";
import { bySort } from "@/lib/use-sheet";
import { useMedia } from "@/lib/use-media";
import { defaultTripName, destinationFor, mapRegionFor, type WizardStop } from "@/lib/wizard";
import { cn, errorMessage } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

export type WizardData = {
  stops: WizardStop[];
  start: string | null;
  end: string | null;
  travelers: string[];
  homeCur: string;
  tripCur: string;
  rate: string;
  rateDate: string | null;
  budget: string;
  name: string;
  starter: boolean;
};

export type Pin = { place: Place | null; loading: boolean; error: string | null };
export type StepProps = {
  d: WizardData;
  set: (patch: Partial<WizardData>) => void;
  /** Save the draft, then move to `to`. Resolves after the move; stays put and shows an error if saving fails. */
  go: (to: number, patch?: Record<string, unknown>) => Promise<boolean>;
  back: () => void;
  saving: boolean;
};

const TOTAL = 6;

/** The owner's setup flow: a draft trip saved after every step, so it resumes on any device. */
export function Wizard({ trip }: { trip: Trip }) {
  const dests = useRows("destinations", bySort);
  const travs = useRows("travelers", bySort);
  if (!dests.isSuccess || !travs.isSuccess) {
    return <Frame step={1} map={null} panel={<PageSkeleton />} aria-busy />;
  }
  return <WizardInner trip={trip} dests={dests.data} travs={travs.data} />;
}

type DestRow = {
  id: string;
  city: string;
  country: string | null;
  nights: number;
  lat: number | null;
  lng: number | null;
};

function WizardInner({ trip, dests, travs }: { trip: Trip; dests: DestRow[]; travs: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const user = useUser().data;
  const ownerName = (user?.email?.split("@")[0] ?? "Me").replace(/^./, (c) => c.toUpperCase());

  const [step, setStep] = useState(() => (dests.length === 0 ? 1 : Math.min(Math.max(trip.onboarding_step, 1), TOTAL)));
  const [d, setD] = useState<WizardData>(() => ({
    stops: dests.map((r) => ({
      key: r.id,
      name: r.city,
      country: r.country,
      countryCode: null,
      lat: Number(r.lat ?? 0),
      lng: Number(r.lng ?? 0),
      nights: r.nights,
    })),
    start: trip.start_date,
    end: trip.end_date,
    travelers: travs.length ? travs.map((t) => t.name) : [ownerName],
    homeCur: trip.home_currency,
    tripCur: trip.foreign_currency,
    rate: trip.rate ? String(Number(trip.rate)) : "1",
    rateDate: trip.rate_date,
    budget: Number(trip.budget) > 0 ? String(Number(trip.budget)) : "",
    name: trip.name === "My Trip" ? "" : trip.name,
    starter: false,
  }));
  const set = useCallback((p: Partial<WizardData>) => setD((x) => ({ ...x, ...p })), []);
  const [pin, setPin] = useState<Pin>({ place: null, loading: false, error: null });
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async ({ patch, to }: { patch: Record<string, unknown>; to: number }) => {
      const { error } = await getSupabase().rpc("save_onboarding", {
        p_trip: trip.id,
        p_step: to,
        p_patch: patch as never,
      });
      if (error) throw error;
    },
  });

  const go = useCallback(
    async (to: number, patch: Record<string, unknown> = {}) => {
      setSaveError(null);
      try {
        await save.mutateAsync({ patch, to });
        setStep(to);
        return true;
      } catch (e) {
        setSaveError(errorMessage(e));
        toast.error("Couldn’t save this step. Check your connection and try again.");
        return false;
      }
    },
    [save],
  );

  const back = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  // Tapping the map drops a pin and looks up its name (step 1 only).
  const onTap = useCallback(async (lat: number, lng: number) => {
    setPin({ place: null, loading: true, error: null });
    const coords = { lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 };
    try {
      const res = await fetch(`/api/geocode?lat=${coords.lat}&lng=${coords.lng}`);
      const body = (await res.json()) as Place & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Not found");
      setPin({ place: body, loading: false, error: null });
    } catch {
      const label = `${Math.abs(coords.lat).toFixed(2)}°${coords.lat >= 0 ? "N" : "S"} ${Math.abs(coords.lng).toFixed(2)}°${coords.lng >= 0 ? "E" : "W"}`;
      setPin({
        place: { ...coords, label, name: "Dropped pin", country: null, countryCode: null },
        loading: false,
        error: "Couldn’t name this spot, but you can still add it.",
      });
    }
  }, []);

  const finish = useMutation({
    mutationFn: async () => {
      const patch = {
        name: d.name.trim() || defaultTripName(d.stops, d.start),
        destination: destinationFor(d.stops),
        map_region: mapRegionFor(d.stops),
      };
      const s = getSupabase();
      const a = await s.rpc("save_onboarding", { p_trip: trip.id, p_step: TOTAL, p_patch: patch as never });
      if (a.error) throw a.error;
      const b = await s.rpc("finish_onboarding", { p_trip: trip.id, p_starter: d.starter });
      if (b.error) throw b.error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Your trip is ready.");
    },
    onError: (e) => toast.error(`Couldn’t create the trip: ${errorMessage(e)}`),
  });

  const props: StepProps = { d, set, go, back, saving: save.isPending };
  const desktop = useMedia("(min-width: 1024px)");
  const insets = desktop
    ? { top: 96, right: 48, bottom: 48, left: 48 }
    : { top: 76, right: 24, bottom: step === 1 ? 300 : 72, left: 24 };
  const stopsOnMap = d.stops
    .filter((s) => s.lat || s.lng)
    .map((s) => ({ id: s.key, name: s.name, lat: s.lat, lng: s.lng }));

  const panel = (() => {
    switch (step) {
      case 1:
        return <StepWhere {...props} pin={pin} setPin={setPin} />;
      case 2:
        return <StepNights {...props} />;
      case 3:
        return <StepWhen {...props} />;
      case 4:
        return <StepWho {...props} trip={trip} />;
      case 5:
        return <StepMoney {...props} />;
      default:
        return <StepReview {...props} finishing={finish.isPending} onCreate={() => finish.mutate()} />;
    }
  })();

  return (
    <Frame
      step={step}
      onBack={step > 1 ? back : undefined}
      error={saveError}
      map={
        <MapView
          stops={stopsOnMap}
          pin={step === 1 && pin.place ? pin.place : null}
          onTap={step === 1 ? onTap : undefined}
          insets={insets}
          label="Trip map"
        />
      }
      panel={panel}
    />
  );
}

/** Mobile: map strip with a sheet over it. Desktop (≥1024): map left, 440px step panel right. */
function Frame({
  step,
  map,
  panel,
  onBack,
  error,
  ...rest
}: {
  step: number;
  map: ReactNode;
  panel: ReactNode;
  onBack?: () => void;
  error?: string | null;
  "aria-busy"?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ground text-fg" {...rest}>
      <div
        className={cn(
          "absolute inset-x-0 top-0 lg:inset-y-0 lg:right-[440px] lg:left-0 lg:h-auto",
          step === 1 ? "h-full" : step >= 3 ? "h-[200px]" : "h-[224px]",
        )}
      >
        {map}
      </div>

      <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between lg:right-[456px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid size-11 place-items-center rounded-full bg-surface shadow-float"
          >
            <ArrowLeft className="size-[22px]" strokeWidth={2.4} aria-hidden />
          </button>
        ) : (
          <span className="size-11" />
        )}
        <div
          role="img"
          aria-label={`Step ${step} of ${TOTAL}`}
          className="flex h-11 items-center gap-[5px] rounded-full bg-surface px-3.5 shadow-float"
        >
          {Array.from({ length: TOTAL }, (_, i) => (
            <i key={i} className={cn("block h-1 w-3.5 rounded-sm", i < step ? "bg-ink" : "bg-line-strong")} />
          ))}
          <b className="ml-2 font-mono text-xs font-bold tracking-wide">
            0{step}/0{TOTAL}
          </b>
        </div>
      </div>

      <section
        aria-label={`Setup step ${step} of ${TOTAL}`}
        className={cn(
          "absolute inset-x-0 bottom-0 z-[5] flex flex-col overflow-y-auto rounded-t-[28px] bg-surface px-5 pt-5 pb-6 shadow-[var(--shadow-sheet)]",
          step === 1 ? "max-h-[72%]" : step >= 3 ? "top-[200px]" : "top-[224px]",
          "lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-l lg:border-border lg:px-8 lg:pt-24 lg:pb-8 lg:shadow-none",
        )}
      >
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-danger-tint p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}
        {panel}
      </section>
    </div>
  );
}
