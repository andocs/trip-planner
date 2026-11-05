"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gifts } from "@/components/pack/gifts";
import { Packing } from "@/components/pack/packing";
import { Reminders } from "@/components/pack/reminders";
import { TripGate } from "@/components/trip-gate";
import { Segmented } from "@/components/ui/segmented";

const TABS = [
  { value: "packing", label: "Packing" },
  { value: "gifts", label: "Pasalubong" },
  { value: "reminders", label: "Reminders" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Pack() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "packing";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pack</h1>
      <Segmented<Tab>
        label="Pack section"
        value={tab}
        onChange={(t) => router.replace(t === "packing" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
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
    <TripGate>
      <Pack />
    </TripGate>
  );
}
