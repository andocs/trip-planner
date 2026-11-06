"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Food } from "@/components/places/food";
import { PlaceList } from "@/components/places/place-list";
import { TripGate } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Segmented } from "@/components/ui/segmented";

type Tab = "food" | "attractions";

function Places() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "attractions" ? "attractions" : "food";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Places</h1>
      <Segmented<Tab>
        label="Places section"
        value={tab}
        onChange={(t) => router.replace(t === "food" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
        options={[
          { value: "food", label: "Food" },
          { value: "attractions", label: "Attractions" },
        ]}
        className="flex w-full"
      />
      {tab === "food" ? (
        <Food />
      ) : (
        <PlaceList table="attractions" noun="attraction" emptyHint="Save sights, tours and things to do." />
      )}
    </div>
  );
}

export function PlacesScreen() {
  return (
    <TripGate>
      <ViewOnlyBanner />
      <Places />
    </TripGate>
  );
}
