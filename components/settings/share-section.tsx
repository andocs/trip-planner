"use client";

import { Copy, Eye, Link2Off, RefreshCw, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { useCreateShare, useShareToken, useStopShare } from "@/lib/queries/share";
import { useClientValue } from "@/lib/use-client-value";

const noop = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );

/** Owner only. A link that shows the plan (itinerary, flights, stays) to people with no account. See migration 30. */
export function ShareSection() {
  const trip = useTrip();
  const token = useShareToken(trip.id, true);
  const create = useCreateShare(trip.id);
  const stop = useStopShare(trip.id);
  const [confirm, setConfirm] = useState<"replace" | "stop" | null>(null);
  const origin = useOrigin();
  const canShare = useClientValue(() => "share" in navigator, false);
  const link = token.data ? `${origin}/share/${token.data}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("View-only link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: trip.name, text: `${trip.name}: the plan`, url: link });
    } catch {
      // user cancelled the share sheet
    }
  }

  return (
    <Card>
      <CardTitle>View-only link</CardTitle>
      <p className="mt-1 text-sm text-fg-muted">
        Show the plan to someone without an account: the itinerary, flights and stays. They can&apos;t change anything, and
        prices, notes and booking numbers are never shown.
      </p>
      {token.isPending ? (
        <p className="mt-3 text-sm text-fg-muted">Checking…</p>
      ) : token.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">Couldn&apos;t check the link. Reload and try again.</p>
      ) : !token.data ? (
        <Button className="mt-3" disabled={create.isPending} onClick={() => create.mutate()}>
          <Eye className="size-4" aria-hidden />
          Create a view-only link
        </Button>
      ) : (
        <>
          <input
            readOnly
            value={link}
            aria-label="View-only link"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 block min-h-11 w-full truncate rounded-xl border border-border bg-surface-2 px-3 font-mono text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copy}>
              <Copy className="size-4" aria-hidden />
              Copy link
            </Button>
            {canShare && (
              <Button variant="secondary" onClick={share}>
                <Share2 className="size-4" aria-hidden />
                Share
              </Button>
            )}
            <Button variant="ghost" disabled={create.isPending} onClick={() => setConfirm("replace")}>
              <RefreshCw className="size-4" aria-hidden />
              New link
            </Button>
            <Button variant="ghost" className="text-danger" disabled={stop.isPending} onClick={() => setConfirm("stop")}>
              <Link2Off className="size-4" aria-hidden />
              Stop sharing
            </Button>
          </div>
        </>
      )}
      {confirm && (
        <ConfirmSheet
          title={confirm === "replace" ? "Create a new view-only link?" : "Stop sharing?"}
          description={
            confirm === "replace"
              ? "The current link stops working. Send the new one to anyone who should still see the plan."
              : "The link stops working at once. You can create a new one later."
          }
          confirmLabel={confirm === "replace" ? "Create new link" : "Stop sharing"}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "replace") create.mutate();
            else stop.mutate();
            setConfirm(null);
          }}
        />
      )}
    </Card>
  );
}
