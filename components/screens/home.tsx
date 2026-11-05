"use client";

import Link from "next/link";
import { BudgetTilesGrid, ChartsCard, CountdownTile, Hero, MapCard, ReadinessCard } from "@/components/home/home-cards";
import { QuickAdd } from "@/components/home/quick-add";
import { TransfersList } from "@/components/spend/settle-up";
import { PageSkeleton, TripGate } from "@/components/trip-gate";
import { Card, CardTitle } from "@/components/ui/card";
import { useBudget } from "@/lib/queries/budget";

function Home() {
  const budget = useBudget();
  if (budget.isPending) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Hero travelers={budget.travelers} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 [&>*]:min-w-0">
        <CountdownTile />
        <BudgetTilesGrid budget={budget} />
        <ChartsCard budget={budget} />
        <MapCard />
        <div className="col-span-2 grid gap-4 md:col-span-4 md:grid-cols-2">
          <ReadinessCard />
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle>Who owes whom</CardTitle>
              <Link href="/spend" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
                Details
              </Link>
            </div>
            <div className="mt-2">
              <TransfersList settlement={budget.settlement} />
            </div>
          </Card>
        </div>
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
