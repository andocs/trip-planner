"use client";

import { Ban, BedDouble, CalendarDays, Clock, Coffee, EllipsisVertical, MapPin, NotebookText, Pencil, Ticket, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
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
import { formatDay, formatMoney, formatTime } from "@/lib/format";
import { FormGroup } from "@/components/ui/form-group";
import { useImages, usePhotoUrls, type ImageRow } from "@/lib/queries/images";
import { useRemoveStay, useSetStayStatus, useStays } from "@/lib/queries/stays";
import type { Stay } from "@/lib/stays";
import { AddStayMenu, type StayStep } from "./add-stay-menu";
import { PlaceLinks } from "@/components/ui/place-links";
import { cancellationFact, checkInFact, isBooked, parseStayDetails, type Fact } from "@/lib/stay-details";
import { useClientValue } from "@/lib/use-client-value";
import { cn } from "@/lib/utils";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const StayFlow = dynamic(() => import("./stay-flow").then((m) => m.StayFlow), { ssr: false });

const byCheckIn = (a: Stay, b: Stay) =>
  (a.check_in ?? "9").localeCompare(b.check_in ?? "9") || a.created_at.localeCompare(b.created_at);

/** A stay IS its hotel idea (same id), so its photos are the idea's photos: nothing new is stored or fetched. */
function useStayPhotos() {
  const { byIdea } = useImages();
  const urlOf = usePhotoUrls();
  const imagesFor = (s: Stay): ImageRow[] => byIdea.get(ideaKey("hotel_ideas", s.id)) ?? [];
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
  const { data: stays = [], isPending } = useStays(byCheckIn);
  const setStatus = useSetStayStatus();
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
                <article aria-label={s.hotel} className="press-card flex h-full flex-col overflow-hidden rounded-[22px] bg-surface shadow-card">
                  <div className="relative">
                    <button type="button" data-card-open onClick={() => setOpenId(s.id)} className="block w-full text-left" aria-label={`Open ${s.hotel}`}>
                      <Photo stay={s} photos={photos} className="aspect-[16/10] lg:aspect-[4/3]" />
                    </button>
                    <span className="absolute top-2.5 left-2.5 rounded-full bg-surface px-0.5 shadow-float">
                      {canEdit ? (
                        <StatusChip
                          status={s.status}
                          label={s.hotel}
                          onChange={(status) => setStatus(s.id, status)}
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
                    <LogExpenseRow kind="hotel_ideas" item={s} />
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
  const remove = useRemoveStay();
  const setStatus = useSetStayStatus();
  const [showRef, setShowRef] = useState(false);
  const cur = trip.home_currency;
  const n = stayNights(stay.check_in, stay.check_out);
  const ppn = pricePerNight(stay.total, n);
  const d = parseStayDetails(stay.details);
  const cancel = cancellationFact(d, today);
  const menuRow = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none data-[highlighted]:bg-surface-2";
  const cancelled = stay.status === "Cancelled";
  const tile = "rounded-2xl px-3.5 py-3";
  return (
    <Sheet
      open
      side
      onOpenChange={(o) => !o && onClose()}
      title={stay.hotel}
      description={stay.city ?? undefined}
      headerExtra={
        canEdit ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label="More actions" className="grid size-11 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
              <EllipsisVertical className="size-5" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className="z-[60] min-w-52 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
                {!cancelled && (
                  <DropdownMenu.Item onSelect={() => setStatus(stay.id, "Cancelled")} className={menuRow}>
                    <Ban className="size-4 text-fg-muted" aria-hidden />
                    Cancel stay
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  onSelect={() => {
                    remove(stay);
                    onClose();
                  }}
                  className={cn(menuRow, "text-danger")}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove from Stays
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : undefined
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={stay.status} />
          {canEdit && (
            <Button size="sm" aria-label="Edit stay" onClick={onEdit}>
              <Pencil className="size-[18px]" aria-hidden />
              Edit
            </Button>
          )}
          <LogExpenseRow kind="hotel_ideas" item={stay} className="pb-0" />
        </div>

        <Photo stay={stay} photos={photos} className="aspect-[2/1] rounded-[18px]" />

        <dl className="grid grid-cols-2 gap-2.5">
          <div className={cn(tile, "bg-teal-tint text-teal")}>
            <dt className="text-xs font-bold">Check-in</dt>
            <dd className="text-[17px] leading-tight font-bold">
              {stay.check_in ? [formatDay(stay.check_in), d.checkInTime ? formatTime(d.checkInTime) : null].filter(Boolean).join(" · ") : "Not set"}
            </dd>
          </div>
          <div className={cn(tile, "bg-teal-tint text-teal")}>
            <dt className="text-xs font-bold">Check-out</dt>
            <dd className="text-[17px] leading-tight font-bold">{stay.check_out ? formatDay(stay.check_out) : "Not set"}</dd>
          </div>
          <div className={cn(tile, "bg-surface-2")}>
            <dt className="text-xs font-bold text-fg-muted">Nights</dt>
            <dd className="text-[17px] leading-tight font-bold">{n !== null ? n : "–"}</dd>
          </div>
          <div className={cn(tile, "bg-surface-2")}>
            <dt className="text-xs font-bold text-fg-muted">Total</dt>
            <dd className="text-[17px] leading-tight font-bold">{stay.total !== null ? formatMoney(stay.total, cur) : "–"}</dd>
            {ppn !== null && n !== null && <dd className="text-xs text-fg-muted">{formatMoney(ppn, cur)} per night</dd>}
          </div>
        </dl>

        {cancel && (
          <p className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold", cancel.tone === "warn" ? "bg-warn-tint text-warn-text" : "bg-teal-tint text-teal")}>
            <Clock className="size-5 shrink-0" aria-hidden />
            {cancel.label}
          </p>
        )}
        {d.breakfast && (
          <p className="inline-flex items-center gap-2 text-sm font-bold">
            <Coffee className="size-4" strokeWidth={2.4} aria-hidden />
            Breakfast included
          </p>
        )}

        {(stay.room || (canEdit && stay.confirmation) || d.website || d.mapsUrl) && (
          <FormGroup icon={Ticket} title="Booking">
            {(stay.room || (canEdit && stay.confirmation)) && (
              <ul className="overflow-hidden rounded-2xl bg-surface-2">
                {canEdit && stay.confirmation && (
                  <li className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-1.5">
                    <span className="min-w-0">
                      <small className="block text-xs text-fg-muted">Confirmation no. (only you)</small>
                      <b className="block font-mono text-[15px] tracking-wider">{showRef ? stay.confirmation : "••••••"}</b>
                    </span>
                    <button type="button" onClick={() => setShowRef((v) => !v)} aria-pressed={showRef} className="min-h-11 px-2 text-sm font-extrabold text-teal">
                      {showRef ? "Hide" : "Show"}
                    </button>
                  </li>
                )}
                {stay.room && (
                  <li className={cn("min-h-14 px-3.5 py-2", canEdit && stay.confirmation && "border-t border-border")}>
                    <small className="block text-xs text-fg-muted">Room</small>
                    <b className="block text-[15px] leading-tight">{stay.room}</b>
                  </li>
                )}
              </ul>
            )}
            <PlaceLinks website={d.website} mapsUrl={d.mapsUrl} className="flex flex-wrap gap-x-5" />
          </FormGroup>
        )}

        {stay.note && (
          <FormGroup icon={NotebookText} title="Notes">
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[15px] whitespace-pre-line">{stay.note}</p>
          </FormGroup>
        )}
      </div>
    </Sheet>
  );
}
