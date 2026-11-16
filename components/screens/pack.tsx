"use client";

import { useSearchParams } from "next/navigation";
import { Gifts } from "@/components/pack/gifts";
import { Packing } from "@/components/pack/packing";
import { Reminders } from "@/components/pack/reminders";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Segmented } from "@/components/ui/segmented";
import { setTabParam } from "@/lib/tab-param";

const TABS = [
  { value: "packing", label: "Packing" },
  { value: "gifts", label: "Pasalubong" },
  { value: "reminders", label: "Reminders" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Pack() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "packing";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pack</h1>
      <Segmented<Tab>
        label="Pack section"
        value={tab}
        onChange={(t) => setTabParam(t === "packing" ? null : t)}
        options={[...TABS]}
        className="flex w-full"
      />
      {tab === "packing" && <Packing />}
      {tab === "gifts" && <Gifts />}
      {tab === "reminders" && <Reminders />}
    </div>
  );
}

export function PackScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <Pack />
    </>
  );
}
