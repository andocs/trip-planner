"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Plane, Plus } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { STATUSES } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import {
  optionalDateTime,
  optionalNumber,
  optionalText,
  optionalUrl,
  requiredText,
  safeHref,
  statusField,
  str,
} from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Flight = Row<"flights">;
type Transfer = Row<"transfers">;

const byDeparture = (a: Flight, b: Flight) =>
  (a.departs_at ?? "9").localeCompare(b.departs_at ?? "9") || a.created_at.localeCompare(b.created_at);

export function Flights() {
  const trip = useTrip();
  const { data: flights = [], isPending } = useRows("flights", byDeparture);
  const update = useUpdateRow("flights", "flight");
  const remove = useDeleteRow("flights", "flight");
  const sheet = useSheet<Flight>();
  const total = flights.filter((f) => f.status !== "Cancelled").reduce((s, f) => s + Number(f.fare ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Flights</CardTitle>
            {flights.length > 0 && (
              <p className="mt-0.5 text-sm text-fg-muted">Fares {formatMoney(total, trip.home_currency)}</p>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>
        {isPending ? (
          <Skeleton className="mt-3 h-20" />
        ) : flights.length === 0 ? (
          <p className="py-3 text-sm text-fg-muted">Add your flights to keep times and booking refs in one place.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {flights.map((f) => (
              <SwipeRow
                key={f.id}
                label={`${f.from_code ?? "?"} to ${f.to_code ?? "?"} ${f.flight_no ?? ""}. Edit`}
                onOpen={() => sheet.openEdit(f)}
                onSwipeDelete={() => remove(f, `${f.from_code ?? ""} → ${f.to_code ?? ""}`)}
                trailing={
                  <StatusChip
                    status={f.status}
                    label={`${f.from_code} to ${f.to_code}`}
                    onChange={(status) => update.mutate({ id: f.id, patch: { status } })}
                  />
                }
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-white dark:bg-surface-2">
                  <Plane className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold tracking-wide">
                    {f.from_code ?? "???"} → {f.to_code ?? "???"}
                  </span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[f.airline, f.flight_no].filter(Boolean).join(" ") || "Airline not set"}
                  </span>
                  {f.departs_at && (
                    <span className="block text-xs text-fg-muted">
                      {formatDateTime(f.departs_at)}
                      {f.arrives_at && ` → ${formatDateTime(f.arrives_at)}`}
                    </span>
                  )}
                  {(f.fare !== null || f.booking_ref) && (
                    <span className="block text-xs tabular-nums">
                      {f.fare !== null && (
                        <span className="font-semibold">{formatMoney(f.fare, trip.home_currency)}</span>
                      )}
                      {f.fare !== null && f.booking_ref && " · "}
                      {f.booking_ref && <span className="font-mono">Ref {f.booking_ref}</span>}
                    </span>
                  )}
                </span>
              </SwipeRow>
            ))}
          </ul>
        )}
      </Card>
      <FlightSheet sheet={sheet} />
      <Transfers />
    </div>
  );
}

const FlightSchema = z.object({
  from_code: optionalText(8).transform((v) => v?.toUpperCase() ?? null),
  to_code: optionalText(8).transform((v) => v?.toUpperCase() ?? null),
  airline: optionalText(80),
  flight_no: optionalText(20),
  departs_at: optionalDateTime,
  arrives_at: optionalDateTime,
  fare: optionalNumber({ min: 0 }),
  status: statusField,
  booking_ref: optionalText(40),
});
type FlightIn = z.input<typeof FlightSchema>;
type FlightOut = z.output<typeof FlightSchema>;

export function FlightSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Flight>> }) {
  const trip = useTrip();
  const insert = useInsertRow("flights", "flight");
  const update = useUpdateRow("flights", "flight");
  const remove = useDeleteRow("flights", "flight");
  const { register, handleSubmit, reset, formState } = useForm<FlightIn, unknown, FlightOut>({
    resolver: zodResolver(FlightSchema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      from_code: str(r?.from_code),
      to_code: str(r?.to_code),
      airline: str(r?.airline),
      flight_no: str(r?.flight_no),
      departs_at: r?.departs_at?.slice(0, 16) ?? "",
      arrives_at: r?.arrives_at?.slice(0, 16) ?? "",
      fare: str(r?.fare),
      status: (r?.status as FlightIn["status"]) ?? "Planned",
      booking_ref: str(r?.booking_ref),
    });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit flight" : "Add flight"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `${sheet.row!.from_code ?? ""} → ${sheet.row!.to_code ?? ""}`);
              sheet.close();
            }
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={errors.from_code?.message}>
          {(p) => (
            <Input {...p} {...register("from_code")} placeholder="MNL" className="uppercase" autoComplete="off" />
          )}
        </Field>
        <Field label="To" error={errors.to_code?.message}>
          {(p) => <Input {...p} {...register("to_code")} placeholder="HAN" className="uppercase" autoComplete="off" />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Airline" error={errors.airline?.message}>
          {(p) => <Input {...p} {...register("airline")} autoComplete="off" />}
        </Field>
        <Field label="Flight no." error={errors.flight_no?.message}>
          {(p) => <Input {...p} {...register("flight_no")} placeholder="PR 595" autoComplete="off" />}
        </Field>
      </div>
      <Field label="Departs (local time)" error={errors.departs_at?.message}>
        {(p) => <Input {...p} type="datetime-local" {...register("departs_at")} />}
      </Field>
      <Field label="Arrives (local time)" error={errors.arrives_at?.message}>
        {(p) => <Input {...p} type="datetime-local" {...register("arrives_at")} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Fare (${trip.home_currency})`} error={errors.fare?.message}>
          {(p) => <Input {...p} {...register("fare")} inputMode="decimal" />}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} {...register("status")}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Booking reference" error={errors.booking_ref?.message}>
        {(p) => <Input {...p} {...register("booking_ref")} autoComplete="off" className="font-mono" />}
      </Field>
    </RowSheet>
  );
}

// ---------------------------------------------------------------------------

function Transfers() {
  const { data: transfers = [], isPending } = useRows("transfers");
  const remove = useDeleteRow("transfers", "transfer");
  const sheet = useSheet<Transfer>();

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Transfers</CardTitle>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-20" />
      ) : transfers.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">Buses, trains, airport pickups between your stops.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {transfers.map((t) => {
            const href = safeHref(t.link);
            return (
              <SwipeRow
                key={t.id}
                label={`${t.route}. Edit`}
                onOpen={() => sheet.openEdit(t)}
                onSwipeDelete={() => remove(t, t.route)}
                trailing={
                  href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onPointerDown={(e) => e.stopPropagation()}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-surface-2"
                      aria-label={`Open link for ${t.route} (new tab)`}
                    >
                      <ExternalLink className="size-5" aria-hidden />
                    </a>
                  )
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.route}</span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[t.provider, t.cost_text].filter(Boolean).join(" · ") || "No details yet"}
                  </span>
                </span>
              </SwipeRow>
            );
          })}
        </ul>
      )}
      <TransferSheet sheet={sheet} />
    </Card>
  );
}

const TransferSchema = z.object({
  route: requiredText("Route", 120),
  provider: optionalText(120),
  cost_text: optionalText(80),
  link: optionalUrl,
});
type TransferIn = z.input<typeof TransferSchema>;
type TransferOut = z.output<typeof TransferSchema>;

function TransferSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Transfer>> }) {
  const insert = useInsertRow("transfers", "transfer");
  const update = useUpdateRow("transfers", "transfer");
  const remove = useDeleteRow("transfers", "transfer");
  const { register, handleSubmit, reset, formState } = useForm<TransferIn, unknown, TransferOut>({
    resolver: zodResolver(TransferSchema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({ route: r?.route ?? "", provider: str(r?.provider), cost_text: str(r?.cost_text), link: str(r?.link) });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit transfer" : "Add transfer"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.route);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Route" error={errors.route?.message}>
        {(p) => <Input {...p} {...register("route")} placeholder="Hanoi → Sapa (sleeper bus)" autoComplete="off" />}
      </Field>
      <Field label="Provider" error={errors.provider?.message}>
        {(p) => <Input {...p} {...register("provider")} autoComplete="off" />}
      </Field>
      <Field label="Cost" error={errors.cost_text?.message} hint="Free text, e.g. “PHP 2,312.04 total”">
        {(p) => <Input {...p} {...register("cost_text")} autoComplete="off" />}
      </Field>
      <Field label="Link" error={errors.link?.message}>
        {(p) => <Input {...p} {...register("link")} type="url" inputMode="url" placeholder="https://" />}
      </Field>
    </RowSheet>
  );
}
