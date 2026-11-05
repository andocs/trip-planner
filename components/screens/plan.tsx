"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Flights } from "@/components/plan/flights";
import { HotelIdeas } from "@/components/plan/hotel-ideas";
import { Itinerary } from "@/components/plan/itinerary";
import { Stays } from "@/components/plan/stays";
import { TripGate } from "@/components/trip-gate";
import { Segmented } from "@/components/ui/segmented";

const TABS = [
  { value: "itinerary", label: "Itinerary" },
  { value: "flights", label: "Flights" },
  { value: "stays", label: "Stays" },
  { value: "ideas", label: "Ideas" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Plan() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "itinerary";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan</h1>
      <Segmented<Tab>
        label="Plan section"
        value={tab}
        onChange={(t) => router.replace(t === "itinerary" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
        options={[...TABS]}
        className="flex w-full"
      />
      {tab === "itinerary" && <Itinerary />}
      {tab === "flights" && <Flights />}
      {tab === "stays" && <Stays />}
      {tab === "ideas" && <HotelIdeas />}
    </div>
  );
}

export function PlanScreen() {
  return (
    <TripGate>
      <Plan />
    </TripGate>
  );
}
