"use client";

import { AlertDialog } from "radix-ui";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useRegenerateLink } from "@/lib/queries/trip";

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
  const link = inviteLink(useOrigin(), trip.join_token);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

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
      <p className="mt-1 text-sm text-fg-muted">Anyone with this link can open and edit the trip. No sign-up needed.</p>
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
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <Button variant="ghost" disabled={regenerate.isPending}>
              <RefreshCw className="size-4" aria-hidden />
              New link
            </Button>
          </AlertDialog.Trigger>
          <ConfirmDialog
            title="Create a new invite link?"
            body="The current link stops working. People who already joined keep access."
            confirm="Create new link"
            onConfirm={() => regenerate.mutate(trip.id)}
          />
        </AlertDialog.Root>
      </div>
    </Card>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirm,
  danger,
  onConfirm,
}: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-6 shadow-card">
        <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
        <AlertDialog.Description className="mt-2 text-sm text-fg-muted">{body}</AlertDialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <AlertDialog.Cancel asChild>
            <Button variant="ghost">Cancel</Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
              {confirm}
            </Button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  );
}
