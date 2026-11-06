"use client";

import { RouteMap, StopsCard } from "@/components/home/dashboard";
import { Card } from "@/components/ui/card";

/** Desktop only: the route stays in view beside the day-by-day plan. */
export function PlanRoute() {
  return (
    <aside aria-label="Route" className="sticky top-6 hidden space-y-4 lg:block">
      <Card className="p-3">
        <div className="relative h-[220px] overflow-hidden rounded-2xl bg-[var(--sea)]">
          <RouteMap bottomInset={40} />
        </div>
      </Card>
      <StopsCard />
    </aside>
  );
}
