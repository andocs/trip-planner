"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { BudgetBlock, NextUp, RouteMap, StopsCard, TripTitle } from "@/components/home/dashboard";
import { PlannedVsSpentCard, ReadinessCard, SpendDonutCard } from "@/components/home/home-cards";
import { QuickAdd } from "@/components/home/quick-add";
import { TransfersList } from "@/components/spend/settle-up";
import { PageSkeleton } from "@/components/trip-gate";
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
    <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-4">
      {/*
        Desktop: two independent columns (map and charts on the left, numbers and lists on the right), so a tall column
        never leaves a hole under a short card. Phone: the two wrappers dissolve (`contents`) and every piece is
        placed by `order`, so the sheet still sits over the map: map, numbers, charts, readiness, who owes whom.
      */}
      <div className="contents lg:col-span-8 lg:block lg:space-y-4">
        <section
          aria-label="Route"
          className="relative order-1 -mx-4 -mt-4 h-[220px] overflow-hidden bg-[var(--sea)] lg:mx-0 lg:mt-0 lg:h-[420px] lg:rounded-3xl"
        >
          <RouteMap bottomInset={150} />
          <Link
            href="/settings"
            aria-label="Trip settings"
            className="absolute top-4 right-4 z-10 grid size-11 place-items-center rounded-full bg-surface shadow-float lg:hidden"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
          </Link>
          <div className="absolute inset-x-5 bottom-14 z-10 hidden rounded-[20px] bg-surface p-4 shadow-float lg:block dark:ring-1 dark:ring-border">
            <TripTitle travelers={budget.travelers} />
          </div>
        </section>
        <div className="order-3 min-w-0">
          <PlannedVsSpentCard budget={budget} />
        </div>
        <div className="order-4 min-w-0">
          <SpendDonutCard budget={budget} />
        </div>
        <div className="order-6 min-w-0">{owes}</div>
      </div>

      <div className="contents lg:col-span-4 lg:block lg:space-y-4">
        {/* Phone: the sheet over the map. Desktop: the top of the right column. */}
        <div className="relative z-10 order-2 -mx-4 -mt-[2.625rem] space-y-3.5 rounded-t-[28px] bg-surface px-4 pt-5 pb-6 shadow-[var(--shadow-sheet)] lg:mx-0 lg:mt-0 lg:space-y-4 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none [&>section]:bg-surface-2 [&>section]:shadow-none lg:[&>section]:bg-surface lg:[&>section]:shadow-card">
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
        <div className="order-5 min-w-0">
          <ReadinessCard />
        </div>
      </div>
      <QuickAdd budget={budget} />
    </div>
  );
}

export function HomeScreen() {
  return <Home />;
}
