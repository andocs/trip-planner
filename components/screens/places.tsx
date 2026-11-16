"use client";

import { useSearchParams } from "next/navigation";
import { Board } from "@/components/board/board";
import { Discover } from "@/components/discover/discover";
import { useCanEdit } from "@/components/trip-gate";
import { Food } from "@/components/places/food";
import { PlaceList } from "@/components/places/place-list";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Segmented } from "@/components/ui/segmented";
import { setSearchParam, setTabParam } from "@/lib/tab-param";

type Tab = "board" | "discover" | "food" | "attractions";

function Places() {
  const params = useSearchParams();
  const canEdit = useCanEdit();
  const raw = params.get("tab");
  // Discover spends the owner's Google allowance, so only the owner sees it (the API and the database refuse anyone else too).
  const tab: Tab =
    raw === "attractions" ? "attractions" : raw === "food" ? "food" : raw === "discover" && canEdit ? "discover" : "board";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Places</h1>
      <Segmented<Tab>
        label="Places section"
        value={tab}
        onChange={(t) => {
          setTabParam(t === "board" ? null : t);
          setSearchParam("idea", null);
        }}
        options={[
          { value: "board", label: "Board" },
          ...(canEdit ? [{ value: "discover" as const, label: "Discover" }] : []),
          { value: "food", label: "Food" },
          { value: "attractions", label: "Attractions" },
        ]}
        className="flex w-full"
      />
      {tab === "board" ? (
        <Board />
      ) : tab === "discover" ? (
        <Discover />
      ) : tab === "food" ? (
        <Food />
      ) : (
        <PlaceList table="attractions" noun="attraction" emptyHint="Save sights, tours and things to do." />
      )}
    </div>
  );
}

export function PlacesScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <Places />
    </>
  );
}
