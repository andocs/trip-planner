"use client";

import { useSearchParams } from "next/navigation";
import { Board } from "@/components/board/board";
import { Discover } from "@/components/discover/discover";
import { useCanEdit } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Segmented } from "@/components/ui/segmented";
import { setSearchParam, setTabParam } from "@/lib/tab-param";

type Tab = "board" | "discover";

/**
 * One place for every hotel, food spot and sight. The Board filters by category (Stays, Food, Sights) with
 * `?cat=`; Discover (Google search) is only for the owner, because it spends their Google allowance.
 */
function Places() {
  const params = useSearchParams();
  const canEdit = useCanEdit();
  // The API and the database refuse Discover to anyone else too.
  const tab: Tab = params.get("tab") === "discover" && canEdit ? "discover" : "board";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Places</h1>
      {canEdit && (
        <Segmented<Tab>
          label="Places section"
          value={tab}
          onChange={(t) => {
            setTabParam(t === "board" ? null : t);
            setSearchParam("idea", null);
          }}
          options={[
            { value: "board", label: "Board" },
            { value: "discover", label: "Discover" },
          ]}
          className="flex w-full"
        />
      )}
      {tab === "board" ? <Board /> : <Discover />}
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
