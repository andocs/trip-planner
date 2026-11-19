import { Compass, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GateLayout, gateTitle } from "./gate-layout";

/** Shown when something breaks while drawing a page. Never prints the error itself (it can name tables or keys). */
export function ErrorScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <GateLayout>
      <h1 className={gateTitle}>Something went wrong</h1>
      <p className="text-fg-muted">
        This page could not be shown. Your trip is safe; try again, or go back to the start.
      </p>
      {onRetry && (
        <Button size="lg" className="mt-1.5 w-full" onClick={onRetry}>
          <TriangleAlert className="size-5" aria-hidden />
          Try again
        </Button>
      )}
      <Button asChild variant="secondary" size="lg" className="w-full">
        <Link href="/">Back to the trip</Link>
      </Button>
    </GateLayout>
  );
}

/** Shown for an address that does not exist. */
export function NotFoundScreen() {
  return (
    <GateLayout>
      <h1 className={gateTitle}>Page not found</h1>
      <p className="text-fg-muted">That address does not lead anywhere in this trip planner.</p>
      <Button asChild size="lg" className="mt-1.5 w-full">
        <Link href="/">
          <Compass className="size-5" aria-hidden />
          Back to the trip
        </Link>
      </Button>
    </GateLayout>
  );
}
