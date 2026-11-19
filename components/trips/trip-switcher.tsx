"use client";

import { Archive, Check, ChevronsUpDown, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useRequestedTripId } from "@/lib/open-trip";
import { useIsAdmin, useActiveTrip, useTripRole } from "@/lib/queries/trip";
import { useArchiveTrip, useMyTrips, useNewTrip, type TripListItem } from "@/lib/queries/trips";
import { screenPath, withTrip } from "@/lib/trip-path";
import { cn } from "@/lib/utils";

const DOT_COLORS = ["#0e6b5c", "#2f5d8a", "#8a4a7b", "#a8690f", "#5d7a2e", "#7a5c3e"];

/** "Mar 28 – Apr 9", "Mar 28" or "Dates not set". */
export function tripDates(t: Pick<TripListItem, "start_date" | "end_date">): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
  if (!t.start_date) return "Dates not set";
  return t.end_date && t.end_date !== t.start_date ? `${fmt(t.start_date)} – ${fmt(t.end_date)}` : fmt(t.start_date);
}

/**
 * The trip picker. `mode="menu"` is the dropdown on the desktop rail, `mode="sheet"` the bottom sheet on phones; both list
 * the trips I am on (the open one ticked), then New trip and Archived trips. Choosing a trip keeps you on the same screen.
 * `children` is the button's face (the flight-board counter and the trip name).
 */
export function TripSwitcher({ mode, children, className }: { mode: "menu" | "sheet"; children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useRequestedTripId();
  const open = useActiveTrip().data;
  const mine = useMyTrips().data ?? [];
  const isAdmin = useIsAdmin().data === true;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const live = mine.filter((t) => !t.archived_at);
  const archived = mine.filter((t) => t.archived_at);
  const currentId = open?.id ?? requested;
  const go = (id: string) => router.push(withTrip(id, screenPath(pathname)));

  const rows = (Item: (p: { onPick: () => void; children: ReactNode }) => ReactNode) => (
    <>
      {live.map((t, i) => (
        <Item key={t.id} onPick={() => go(t.id)}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl font-display font-extrabold text-white" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} aria-hidden>
            {t.name.trim().charAt(0).toUpperCase() || "T"}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate font-bold">{t.name}</span>
            <span className="block truncate text-[13px] text-fg-muted">{t.status === "draft" ? "Setting up" : tripDates(t)}</span>
          </span>
          {t.id === currentId ? (
            <Check className="size-[18px] shrink-0 text-teal" aria-label="Open now" />
          ) : t.role !== "owner" ? (
            <span className="shrink-0 rounded-full bg-teal-tint px-2 py-0.5 text-[11.5px] font-bold text-teal">{t.role === "editor" ? "Editor" : "Viewer"}</span>
          ) : null}
        </Item>
      ))}
      <div className="my-1.5 h-px bg-border" role="separator" />
      {isAdmin && (
        <Item onPick={() => setNewOpen(true)}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-dashed border-line-strong text-fg-muted" aria-hidden>
            <Plus className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-bold">New trip</span>
            <span className="block text-[13px] text-fg-muted">Keeps your other trips as they are</span>
          </span>
        </Item>
      )}
      {archived.length > 0 && (
        <Item onPick={() => setArchivedOpen(true)}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-muted" aria-hidden>
            <Archive className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block font-bold">Archived trips</span>
            <span className="block text-[13px] text-fg-muted">{archived.length} finished, read only</span>
          </span>
        </Item>
      )}
    </>
  );

  const face = (
    <>
      {children}
      <ChevronsUpDown className="size-[18px] shrink-0 text-fg-muted" aria-hidden />
    </>
  );

  return (
    <>
      {mode === "menu" ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={className} aria-label="Switch trip">
              {face}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-[320px] rounded-2xl border border-border bg-surface p-2 shadow-card">
              <DropdownMenu.Label className="px-2.5 pt-1 pb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">Your trips</DropdownMenu.Label>
              {rows(({ onPick, children: c }) => (
                <DropdownMenu.Item onSelect={onPick} className="flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2">
                  {c}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <>
          <button type="button" className={className} aria-label="Switch trip" onClick={() => setSheetOpen(true)}>
            {face}
          </button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Your trips">
            {rows(({ onPick, children: c }) => (
              <button
                type="button"
                className={cn("flex min-h-14 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm hover:bg-surface-2")}
                onClick={() => {
                  setSheetOpen(false);
                  onPick();
                }}
              >
                {c}
              </button>
            ))}
          </Sheet>
        </>
      )}
      <NewTripSheet open={newOpen} onOpenChange={setNewOpen} />
      <ArchivedSheet open={archivedOpen} onOpenChange={setArchivedOpen} trips={archived} onOpenTrip={go} />
    </>
  );
}

/** Adds a trip alongside the others. The setup wizard opens for it next. */
export function NewTripSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const current = useActiveTrip().data;
  const role = useTripRole(current?.id).data;
  const add = useNewTrip();
  const [name, setName] = useState("");
  const [copy, setCopy] = useState(true);
  const canCopy = !!current && role === "owner";

  const submit = () =>
    add.mutate(
      { name: name.trim() || "My Trip", copyFrom: canCopy && copy ? current!.id : undefined },
      {
        onSuccess: (id) => {
          onOpenChange(false);
          setName("");
          router.push(withTrip(id, "/"));
        },
      },
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New trip" description="Your other trips stay exactly as they are.">
      <form
        className="space-y-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Trip name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Hokkaido, winter" autoComplete="off" />}</Field>
        {canCopy && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="size-5 accent-[var(--teal)]" />
            Copy travelers, currencies and exchange rate from {current!.name}
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={add.isPending}>
            Continue to setup
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function ArchivedSheet({ open, onOpenChange, trips, onOpenTrip }: { open: boolean; onOpenChange: (o: boolean) => void; trips: TripListItem[]; onOpenTrip: (id: string) => void }) {
  const archive = useArchiveTrip();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Archived trips" description="Finished trips are read only. Restore puts one back in your list.">
      <ul className="pb-2">
        {trips.map((t) => (
          <li key={t.id} className="flex min-h-14 items-center gap-2.5 border-t border-border first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{t.name}</span>
              <span className="block truncate text-[13px] text-fg-muted">{tripDates(t)}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onOpenTrip(t.id);
              }}
            >
              Open
            </Button>
            {t.role === "owner" && (
              <Button variant="secondary" size="sm" disabled={archive.isPending} onClick={() => archive.mutate({ tripId: t.id, restore: true })}>
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
