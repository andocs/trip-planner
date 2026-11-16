"use client";

import { Stays } from "@/components/plan/stays";
import { ViewOnlyBanner } from "@/components/view-only-banner";

export function StaysScreen() {
  return (
    <>
      <ViewOnlyBanner />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Stays</h1>
        <Stays />
      </div>
    </>
  );
}
