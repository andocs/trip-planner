"use client";

import { Copy, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { TripGate, useTrip } from "@/components/trip-gate";

function Home() {
  const trip = useTrip();

  async function copyInvite() {
    const link = `${window.location.origin}/join/${trip.join_token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Long-press to copy from Settings instead.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-hero p-6 text-hero-fg shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/70">{trip.destination ?? "Add a destination in Settings"}</p>
            <h1 className="mt-1 text-3xl font-bold">{trip.name}</h1>
          </div>
          <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Link href="/settings" aria-label="Trip settings">
              <Settings className="size-5" aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="absolute -right-10 -bottom-12 size-40 rounded-full bg-teal/30" aria-hidden />
        <div className="absolute right-16 -bottom-16 size-28 rounded-full bg-gold/30" aria-hidden />
      </section>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <CardTitle>Invite</CardTitle>
          <p className="mt-1 text-sm text-fg-muted">Anyone with the link can view and edit this trip.</p>
        </div>
        <Button variant="secondary" onClick={copyInvite}>
          <Copy className="size-4" aria-hidden />
          Copy link
        </Button>
      </Card>
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
