"use client";

import { AlertDialog } from "radix-ui";
import { Archive, CalendarPlus, FileJson, FileSpreadsheet, FileText, Loader2, Plus, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { NewTripSheet } from "@/components/trips/trip-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { fetchExportData, useLoadExample, useRestoreBackup, useStartNewTrip } from "@/lib/queries/trip-actions";
import { withTrip } from "@/lib/trip-path";
import { errorMessage } from "@/lib/utils";

/** `owner` shows the admin-only "Start a new trip"; editors get export and the example only. */
export function TripTools({ owner = false }: { owner?: boolean }) {
  const trip = useTrip();
  const router = useRouter();
  const loadExample = useLoadExample(trip.id);
  const startNew = useStartNewTrip(trip.id);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [calendaring, setCalendaring] = useState(false);
  const [saving, setSaving] = useState<"backup" | "csv" | null>(null);
  const restore = useRestoreBackup(trip.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [copySetup, setCopySetup] = useState(true);

  /** Backup (JSON) and the expenses CSV share one flow: fetch fresh, build, save. */
  async function saveBackup(kind: "backup" | "csv") {
    setSaving(kind);
    try {
      const [backup, { saveTextFile }, data] = await Promise.all([import("@/lib/backup"), import("@/lib/download"), fetchExportData(trip)]);
      if (kind === "backup") {
        saveTextFile(backup.backupFileName(trip.name), "application/json", JSON.stringify(backup.buildBackup(data), null, 2));
        toast.success("Backup downloaded. Keep the file private: it has booking details.");
      } else {
        saveTextFile(`${trip.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "Trip"} expenses.csv`, "text/csv", backup.expensesCsv(data));
        toast.success("Expenses downloaded as CSV");
      }
    } catch (e) {
      toast.error(`Download failed: ${errorMessage(e)}`);
    } finally {
      setSaving(null);
    }
  }

  async function onBackupFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ""; // so the same file can be chosen again
    if (!file) return;
    restore.mutate(await file.text());
  }

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

  async function exportCalendar() {
    setCalendaring(true);
    try {
      const [{ downloadIcs }, data] = await Promise.all([import("@/lib/ics"), fetchExportData(trip)]);
      downloadIcs(data);
      toast.success("Calendar file downloaded");
    } catch (e) {
      toast.error(`Calendar export failed: ${errorMessage(e)}`);
    } finally {
      setCalendaring(false);
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
      <Button variant="secondary" className="w-full justify-start" onClick={exportCalendar} disabled={calendaring}>
        {calendaring ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <CalendarPlus className="size-5" aria-hidden />
        )}
        Add to calendar (.ics)
      </Button>
      <p className="-mt-1 text-xs text-fg-muted">Activities, flights and stays. Booking numbers and prices are left out.</p>
      <Button variant="secondary" className="w-full justify-start" onClick={() => saveBackup("csv")} disabled={saving !== null}>
        {saving === "csv" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileText className="size-5" aria-hidden />}
        Expenses as CSV
      </Button>
      <Button variant="secondary" className="w-full justify-start" onClick={() => saveBackup("backup")} disabled={saving !== null}>
        {saving === "backup" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileJson className="size-5" aria-hidden />}
        Download a backup (JSON)
      </Button>
      <Button variant="secondary" className="w-full justify-start" onClick={() => fileInput.current?.click()} disabled={restore.isPending}>
        {restore.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
        Restore from a backup
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Backup file"
        tabIndex={-1}
        onChange={(e) => void onBackupFile(e.target.files?.[0])}
      />
      <p className="-mt-1 text-xs text-fg-muted">
        A backup has everything except photos, votes, comments, the invite link and flight booking references. Restoring only works in a trip with no data yet.
      </p>
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

      {owner && (
        <>
          <Button variant="secondary" className="w-full justify-start" onClick={() => setNewOpen(true)}>
            <Plus className="size-5" aria-hidden />
            New trip
          </Button>
          <p className="-mt-1 text-xs text-fg-muted">Plan another trip alongside this one. &ldquo;{trip.name}&rdquo; is not changed.</p>
          <NewTripSheet open={newOpen} onOpenChange={setNewOpen} />
        </>
      )}

      {owner && (
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
            <AlertDialog.Title className="text-lg font-bold">End this trip and start a new one?</AlertDialog.Title>
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
                  onClick={() => startNew.mutate(copySetup, { onSuccess: (newId) => router.push(withTrip(newId, "/")) })}
                >
                  Archive and start new
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      )}
    </Card>
  );
}
