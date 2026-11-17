"use client";

import { BedDouble, CalendarDays, Coffee, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { CoverHero } from "@/components/photos/cover-hero";
import { LogExpenseRow } from "@/components/plan/log-expense";
import { EditOnly, useCanEdit, useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, StatusChip } from "@/components/ui/status-chip";
import { localISODate, pricePerNight, stayNights, tripNights } from "@/lib/calc";
import { ideaKey } from "@/lib/drafts";
import { formatDay, formatMoney } from "@/lib/format";
import { useImages, usePhotoUrls, type ImageRow } from "@/lib/queries/images";
import { useDeleteRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { AddStayMenu, type StayStep } from "./stay-flow";
import { PlaceLinks } from "@/components/ui/place-links";
import { cancellationFact, checkInFact, isBooked, parseStayDetails, type Fact } from "@/lib/stay-details";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const StayFlow = dynamic(() => import("./stay-flow").then((m) => m.StayFlow), { ssr: false });

type Stay = Row<"stays">;
const byCheckIn = (a: Stay, b: Stay) =>
  (a.check_in ?? "9").localeCompare(b.check_in ?? "9") || a.created_at.localeCompare(b.created_at);
const norm = (s: string) => s.trim().toLowerCase();

/**
 * A booked stay shows the cover photo of the board idea with the same hotel name, when there is one: the photos
 * were already saved there, so nothing new is stored or fetched.
 */
function useStayPhotos() {
  const ideas = useRows("hotel_ideas").data ?? [];
  const { byIdea } = useImages();
  const urlOf = usePhotoUrls();
  const byName = new Map(ideas.map((i) => [norm(i.hotel), i.id]));
  const imagesFor = (s: Stay): ImageRow[] => {
    const id = byName.get(norm(s.hotel));
    return id ? (byIdea.get(ideaKey("hotel_ideas", id)) ?? []) : [];
  };
  return { imagesFor, urlOf };
}

function Photo({ stay, photos, className }: { stay: Stay; photos: ReturnType<typeof useStayPhotos>; className?: string }) {
  const images = photos.imagesFor(stay);
  if (images.length > 0)
    return <CoverHero images={images} urlOf={photos.urlOf} name={stay.hotel} tag={null} className={className} />;
  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-gradient-to-br from-[color-mix(in_srgb,var(--chart-3)_30%,var(--surface))] to-[color-mix(in_srgb,var(--chart-1)_24%,var(--surface))] text-fg-muted",
        className,
      )}
    >
      <BedDouble className="size-9 opacity-70" strokeWidth={1.6} aria-hidden />
      <span className="text-[13px] font-bold">No photo yet</span>
    </div>
  );
}

const factClass = (f: Fact) =>
  f.tone === "ok" ? "bg-teal-tint text-teal" : f.tone === "warn" ? "bg-warn-tint text-warn-text" : "bg-surface-2 text-fg";

function Facts({ facts }: { facts: (Fact | null)[] }) {
  const shown = facts.filter((f): f is Fact => !!f);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Key facts">
      {shown.map((f) => (
        <li key={f.label} className={cn("inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold", factClass(f))}>
          {f.label}
        </li>
      ))}
    </ul>
  );
}

function datesLine(s: Stay, n: number | null) {
  return s.check_in
    ? `${formatDay(s.check_in, "d MMM")} → ${formatDay(s.check_out, "d MMM")}${n !== null ? ` · ${n} ${n === 1 ? "night" : "nights"}` : ""}`
    : "Dates not set";
}

export function Stays() {
  const trip = useTrip();
  const canEdit = useCanEdit();
  const { data: stays = [], isPending } = useRows("stays", byCheckIn);
  const update = useUpdateRow("stays", "stay");
  // What is open over the page: the idea picker, the stay form (the same form as a place), or an add-a-plan form.
  const [flow, setFlow] = useState<StayStep | null>(null);
  const photos = useStayPhotos();
  const today = useClientValue(() => localISODate(), null);
  const [openId, setOpenId] = useState<string | null>(null);
  const cur = trip.home_currency;

  const active = stays.filter((s) => s.status !== "Cancelled");
  const total = active.reduce((s, x) => s + Number(x.total ?? 0), 0);
  const nights = active.reduce((s, x) => s + (stayNights(x.check_in, x.check_out) ?? 0), 0);
  const needed = tripNights(trip.start_date, trip.end_date);
  const booked = active.filter((s) => isBooked(s.status)).length;
  const opened = stays.find((s) => s.id === openId);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        {stays.length > 0 ? (
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2.5 rounded-[18px] bg-surface p-3.5 shadow-card sm:flex sm:gap-8">
            <div className="col-span-2 sm:col-span-1">
              <dd className="font-mono text-[17px] font-bold">{formatMoney(total, cur)}</dd>
              <dt className="text-xs font-bold text-fg-muted">Total stays</dt>
            </div>
            <div>
              <dd className="font-mono text-[17px] font-bold">
                {nights}
                {needed !== null && ` of ${needed}`}
              </dd>
              <dt className="text-xs font-bold text-fg-muted">Nights covered</dt>
            </div>
            <div>
              <dd className="font-mono text-[17px] font-bold">
                {booked} of {active.length}
              </dd>
              <dt className="text-xs font-bold text-fg-muted">Booked</dt>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">Where you&rsquo;ll sleep each night, and what&rsquo;s booked.</p>
        )}
        <EditOnly>
          <AddStayMenu onChoose={setFlow} />
        </EditOnly>
      </div>

      {isPending ? (
        <Skeleton className="h-64" />
      ) : stays.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-5 py-9 text-center shadow-card">
          <BedDouble className="size-10 text-fg-muted" strokeWidth={1.8} aria-hidden />
          <p className="max-w-[40ch] text-fg-muted">
            No stays yet. Shortlist hotels on Places, then add the one you book here.
          </p>
          <EditOnly>
            <AddStayMenu onChoose={setFlow} label="Add a stay" variant="primary" />
          </EditOnly>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          {stays.map((s) => {
            const n = stayNights(s.check_in, s.check_out);
            const ppn = pricePerNight(s.total, n);
            const d = parseStayDetails(s.details);
            return (
              <li key={s.id}>
                <article aria-label={s.hotel} className="flex h-full flex-col overflow-hidden rounded-[22px] bg-surface shadow-card">
                  <div className="relative">
                    <button type="button" onClick={() => setOpenId(s.id)} className="block w-full text-left" aria-label={`Open ${s.hotel}`}>
                      <Photo stay={s} photos={photos} className="aspect-[16/10] lg:aspect-[4/3]" />
                    </button>
                    <span className="absolute top-2.5 left-2.5 rounded-full bg-surface px-0.5 shadow-float">
                      {canEdit ? (
                        <StatusChip
                          status={s.status}
                          label={s.hotel}
                          onChange={(status) => update.mutate({ id: s.id, patch: { status } })}
                        />
                      ) : (
                        <StatusBadge status={s.status} />
                      )}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-4">
                    <button type="button" onClick={() => setOpenId(s.id)} className="flex flex-col gap-1.5 text-left">
                      <h3 className="font-display text-[19px] leading-[1.15] font-extrabold tracking-tight">{s.hotel}</h3>
                      {(s.city || s.room) && (
                        <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                          <MapPin className="size-[15px] shrink-0" strokeWidth={2.4} aria-hidden />
                          <span className="truncate">{[s.city, s.room].filter(Boolean).join(" · ")}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        <CalendarDays className="size-4 shrink-0" strokeWidth={2.4} aria-hidden />
                        {datesLine(s, n)}
                      </span>
                    </button>
                    <Facts
                      facts={[
                        cancellationFact(d, today),
                        isBooked(s.status) ? checkInFact(s.check_in, s.check_out, today) : null,
                        d.breakfast ? { label: "Breakfast included" } : null,
                      ]}
                    />
                    {s.total !== null && (
                      <p className="mt-auto flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
                        <span className="font-mono text-lg font-bold tabular-nums">
                          {ppn !== null ? formatMoney(ppn, cur) : formatMoney(s.total, cur)}
                          <small className="font-sans text-[13px] font-medium text-fg-muted"> / {ppn !== null ? "night" : "stay"}</small>
                        </span>
                        {ppn !== null && (
                          <span className="text-[13px] text-fg-muted">
                            total <b className="font-mono text-fg">{formatMoney(s.total, cur)}</b>
                          </span>
                        )}
                      </p>
                    )}
                    <LogExpenseRow kind="stays" item={s} />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {opened && (
        <StayDetail
          stay={opened}
          photos={photos}
          today={today}
          canEdit={canEdit}
          onEdit={() => {
            setOpenId(null);
            setFlow({ step: "form", stay: opened });
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {flow && <StayFlow flow={flow} onFlow={setFlow} onClose={() => setFlow(null)} />}
    </div>
  );
}

function StayDetail({
  stay,
  photos,
  today,
  canEdit,
  onEdit,
  onClose,
}: {
  stay: Stay;
  photos: ReturnType<typeof useStayPhotos>;
  today: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const trip = useTrip();
  const remove = useDeleteRow("stays", "stay");
  const cur = trip.home_currency;
  const n = stayNights(stay.check_in, stay.check_out);
  const ppn = pricePerNight(stay.total, n);
  const d = parseStayDetails(stay.details);
  const cancel = cancellationFact(d, today);
  const rows: [string, string | null][] = [
    ["Check-in", stay.check_in ? [formatDay(stay.check_in), d.checkInTime].filter(Boolean).join(" · ") : null],
    ["Check-out", stay.check_out ? formatDay(stay.check_out) : null],
    ["Nights", n !== null ? String(n) : null],
    ["Room", stay.room],
    ["Cancellation", cancel?.label ?? null],
  ];
  return (
    <Sheet
      open
      side
      onOpenChange={(o) => !o && onClose()}
      title={stay.hotel}
      description={[stay.city, stay.status].filter(Boolean).join(" · ")}
      footer={
        canEdit ? (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                remove(stay, stay.hotel);
                onClose();
              }}
            >
              Delete
            </Button>
            <Button size="lg" className="flex-1" onClick={onEdit}>
              Edit stay
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4 pt-1">
        <Photo stay={stay} photos={photos} className="aspect-[16/9] rounded-[18px]" />
        <dl className="grid grid-cols-2 gap-2.5">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                <dt className="font-mono text-[11px] font-bold tracking-[0.08em] text-fg-muted uppercase">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
        </dl>
        {d.breakfast && (
          <p className="inline-flex items-center gap-2 text-sm font-bold">
            <Coffee className="size-4" strokeWidth={2.4} aria-hidden />
            Breakfast included
          </p>
        )}
        {stay.total !== null && (
          <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
            {ppn !== null && n !== null && (
              <p className="text-sm text-fg-muted">
                {n} {n === 1 ? "night" : "nights"} × {formatMoney(ppn, cur)}
              </p>
            )}
            <p className="font-display text-2xl font-extrabold">{formatMoney(stay.total, cur)}</p>
          </div>
        )}
        <LogExpenseRow kind="stays" item={stay} />
        {canEdit && stay.confirmation && (
          <div className="rounded-2xl bg-surface-2 px-3.5 py-3">
            <p className="text-xs font-bold text-fg-muted">Confirmation no.</p>
            <p className="font-mono text-lg font-bold tracking-wider">{stay.confirmation}</p>
          </div>
        )}
        {stay.note && <p className="text-[15px]">{stay.note}</p>}
        <PlaceLinks website={d.website} mapsUrl={d.mapsUrl} className="flex flex-wrap gap-x-5" />
      </div>
    </Sheet>
  );
}
