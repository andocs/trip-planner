"use client";

import { Copy, RefreshCw, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { useRegenerateLink } from "@/lib/queries/trip";
import { useClientValue } from "@/lib/use-client-value";

const noop = () => () => {};
const useOrigin = () =>
  useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );

export function inviteLink(origin: string, token: string) {
  return `${origin}/join/${token}`;
}

export function InviteSection() {
  const trip = useTrip();
  const regenerate = useRegenerateLink();
  const [confirming, setConfirming] = useState(false);
  const link = inviteLink(useOrigin(), trip.join_token);
  const canShare = useClientValue(() => "share" in navigator, false);

  // Only the owner receives the link (migration 25); anyone else sees nothing rather than a broken link.
  if (!trip.join_token) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: trip.name, text: `Plan ${trip.name} with me`, url: link });
    } catch {
      // user cancelled the share sheet
    }
  }

  return (
    <Card>
      <CardTitle>Invite link</CardTitle>
      <p className="mt-1 text-sm text-fg-muted">
        Anyone with this link can view the trip, but only you can change it. A new link signs out everyone who joined
        with the old one.
      </p>
      <input
        readOnly
        value={link}
        aria-label="Invite link"
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
        <Button variant="ghost" disabled={regenerate.isPending} onClick={() => setConfirming(true)}>
          <RefreshCw className="size-4" aria-hidden />
          New link
        </Button>
        {confirming && (
          <ConfirmSheet
            title="Create a new invite link?"
            description="The current link stops working and everyone who joined with it loses access until you send them the new link."
            confirmLabel="Create new link"
            onClose={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              regenerate.mutate(trip.id);
            }}
          />
        )}
      </div>
    </Card>
  );
}
