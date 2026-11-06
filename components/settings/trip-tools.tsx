"use client";

import { AlertDialog } from "radix-ui";
import { Archive, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { fetchExportData, useLoadExample, useStartNewTrip } from "@/lib/queries/trip-actions";
import { errorMessage } from "@/lib/utils";

export function TripTools() {
  const trip = useTrip();
  const router = useRouter();
  const loadExample = useLoadExample();
  const startNew = useStartNewTrip();
  const [exporting, setExporting] = useState(false);
  const [copySetup, setCopySetup] = useState(true);

  async function exportExcel() {
    setExporting(true);
    try {
      const [{ downloadWorkbook }, data] = await Promise.all([import("@/lib/export"), fetchExportData(trip)]);
      await downloadWorkbook(data);
      toast.success("Excel file downloaded");
    } catch (e) {
      toast.error(`Export failed: ${errorMessage(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="space-y-3">
      <CardTitle>Trip tools</CardTitle>
      <Button variant="secondary" className="w-full justify-start" onClick={exportExcel} disabled={exporting}>
        {exporting ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-5" aria-hidden />
        )}
        Export to Excel
      </Button>
      <Button
        variant="secondary"
        className="w-full justify-start"
        onClick={() => loadExample.mutate()}
        disabled={loadExample.isPending}
      >
        {loadExample.isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-5" aria-hidden />
        )}
        Load the Vietnam &rsquo;26 example
      </Button>
      <p className="-mt-1 text-xs text-fg-muted">The example only loads into a trip with no data yet.</p>

      <AlertDialog.Root>
        <AlertDialog.Trigger asChild>
          <Button variant="secondary" className="w-full justify-start text-danger" disabled={startNew.isPending}>
            <Archive className="size-5" aria-hidden />
            Start a new trip
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-6 shadow-card">
            <AlertDialog.Title className="text-lg font-bold">Start a new trip?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-fg-muted">
              &ldquo;{trip.name}&rdquo; will be archived and everyone on it moves to a fresh, empty trip. Your invite
              link moves too. Export to Excel first if you want a copy.
            </AlertDialog.Description>
            <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={copySetup}
                onChange={(e) => setCopySetup(e.target.checked)}
                className="size-5 accent-[var(--teal)]"
              />
              Keep travelers, currencies and exchange rate
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="danger"
                  onClick={() => startNew.mutate(copySetup, { onSuccess: () => router.push("/") })}
                >
                  Archive and start new
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Card>
  );
}
