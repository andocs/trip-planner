"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { BudgetBlock, NextUp, RouteMap, StopsCard, TripTitle } from "@/components/home/dashboard";
import { PlannedVsSpentCard, ReadinessCard, SpendDonutCard } from "@/components/home/home-cards";
import { QuickAdd } from "@/components/home/quick-add";
import { TransfersList } from "@/components/spend/settle-up";
import { PageSkeleton, TripGate } from "@/components/trip-gate";
import { Card, CardTitle } from "@/components/ui/card";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { useBudget } from "@/lib/queries/budget";

/**
 * Home. Phone: a map strip with the sheet of numbers lifted over it. Desktop: a 12-column grid,
 * the map hero beside the budget, then the charts. The numbers are written once and laid out by CSS.
 */
function Home() {
  const budget = useBudget();
  if (budget.isPending) return <PageSkeleton />;

  const owes = (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Who owes whom</CardTitle>
        <Link href="/spend" className="inline-flex min-h-11 items-center text-sm font-bold text-teal">
          Details
        </Link>
      </div>
      <div className="mt-2">
        <TransfersList settlement={budget.settlement} />
      </div>
    </Card>
  );

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-4">
      {/* Map hero */}
      <section
        aria-label="Route"
        className="relative -mx-4 -mt-4 h-[220px] overflow-hidden bg-[var(--sea)] lg:col-span-8 lg:row-span-2 lg:mx-0 lg:mt-0 lg:h-[420px] lg:rounded-3xl"
      >
        <RouteMap bottomInset={150} />
        <Link
          href="/settings"
          aria-label="Trip settings"
          className="absolute top-4 right-4 z-10 grid size-11 place-items-center rounded-full bg-surface shadow-float lg:hidden"
        >
          <SlidersHorizontal className="size-5" aria-hidden />
        </Link>
        <div className="absolute inset-x-5 bottom-9 z-10 hidden rounded-[20px] bg-surface p-4 shadow-float lg:block dark:ring-1 dark:ring-border">
          <TripTitle travelers={budget.travelers} />
        </div>
      </section>

      {/* Phone: the sheet over the map. Desktop: the right column. */}
      <div className="relative z-10 -mx-4 -mt-7 space-y-3.5 rounded-t-[28px] bg-surface px-4 pt-5 pb-6 shadow-[var(--shadow-sheet)] lg:col-span-4 lg:row-span-2 lg:mx-0 lg:mt-0 lg:space-y-4 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none [&>section]:bg-surface-2 [&>section]:shadow-none lg:[&>section]:bg-surface lg:[&>section]:shadow-card">
        <div className="lg:hidden">
          <TripTitle travelers={budget.travelers} />
        </div>
        <ViewOnlyBanner />
        <div className="lg:rounded-[20px] lg:bg-surface lg:p-4 lg:shadow-card">
          <BudgetBlock budget={budget} />
        </div>
        <NextUp budget={budget} />
        <StopsCard />
      </div>

      {/* Charts and readiness */}
      <div className="mt-3.5 space-y-3.5 lg:col-span-12 lg:mt-0 lg:grid lg:grid-cols-12 lg:gap-4 lg:space-y-0 [&>section]:min-w-0">
        <div className="lg:col-span-7 [&>section]:h-full">
          <PlannedVsSpentCard budget={budget} />
        </div>
        <div className="lg:col-span-5 [&>section]:h-full">
          <SpendDonutCard budget={budget} />
        </div>
        <div className="lg:col-span-7 [&>section]:h-full">
          <ReadinessCard />
        </div>
        <div className="lg:col-span-5 [&>section]:h-full">{owes}</div>
      </div>
      <QuickAdd budget={budget} />
    </div>
  );
}

export function HomeScreen() {
  return (
    <TripGate>
      <Home />
    </TripGate>
  );
}
