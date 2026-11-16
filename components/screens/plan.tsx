"use client";

import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { TabProgress, TabSkeleton } from "@/components/plan/tab-loading";
import { Flights } from "@/components/plan/flights";
import { HotelIdeas } from "@/components/plan/hotel-ideas";
import { Itinerary } from "@/components/plan/itinerary";
import { PlanRoute } from "@/components/plan/plan-route";
import { Stays } from "@/components/plan/stays";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Segmented } from "@/components/ui/segmented";
import { setTabParam } from "@/lib/tab-param";

const TABS = [
  { value: "itinerary", label: "Itinerary" },
  { value: "flights", label: "Flights" },
  { value: "stays", label: "Stays" },
  { value: "ideas", label: "Ideas" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Plan() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "itinerary";
  const shown = useDeferredValue(tab);
  const pending = shown !== tab;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), 150);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [pending]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan</h1>
      <Segmented<Tab>
        label="Plan section"
        value={tab}
        onChange={(t) => setTabParam(t === "itinerary" ? null : t)}
        options={[...TABS]}
        className="flex w-full"
      />
      <TabProgress pending={pending} label={TABS.find((t) => t.value === tab)?.label ?? ""} />
      {pending && slow ? (
        <TabSkeleton tab={tab} />
      ) : (
        <div className={pending ? "pointer-events-none opacity-55 transition-opacity" : undefined} aria-busy={pending}>
          {shown === "itinerary" && (
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-4">
              <Itinerary />
              <PlanRoute />
            </div>
          )}
          {shown === "flights" && <Flights />}
          {shown === "stays" && <Stays />}
          {shown === "ideas" && <HotelIdeas />}
        </div>
      )}
    </div>
  );
}

export function PlanScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <Plan />
    </>
  );
}
