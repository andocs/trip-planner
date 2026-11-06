"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/supabase/client";
import { GateLayout, gateTitle } from "./gate-layout";

export async function signOutAndLeave() {
  await signOut();
  window.location.replace("/");
}

/** Signed in, but not on any trip and not the owner. */
export function NoAccess({ email }: { email: string | null }) {
  return (
    <GateLayout>
      <h1 className={gateTitle}>No access yet</h1>
      <p className="text-fg-muted">
        {email ? (
          <>
            You&rsquo;re signed in as <b className="text-fg">{email}</b>, but this account isn&rsquo;t on a trip.
          </>
        ) : (
          <>This session isn&rsquo;t on a trip.</>
        )}{" "}
        Ask the trip owner for an invite link.
      </p>
      <Button variant="outline" size="lg" className="mt-1.5 w-full" onClick={signOutAndLeave}>
        <LogOut className="size-5" aria-hidden />
        Sign out
      </Button>
    </GateLayout>
  );
}
