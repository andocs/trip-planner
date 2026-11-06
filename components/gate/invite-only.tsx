import { KeyRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GateLayout, gateTitle } from "./gate-layout";

/** What a signed-out visitor without an invite sees. No app chrome, no data, no trip details. */
export function InviteOnly() {
  return (
    <GateLayout>
      <h1 className={gateTitle}>Invite only</h1>
      <p className="text-fg-muted">
        This is a private trip planner. Open the invite link you were sent to follow the trip.
      </p>
      <Button asChild size="lg" className="mt-1.5 w-full">
        <Link href="/login">
          <KeyRound className="size-5" aria-hidden />
          Owner sign in
        </Link>
      </Button>
      <p className="text-sm text-fg-muted">Not the owner? Ask whoever planned the trip for an invite link.</p>
    </GateLayout>
  );
}
