"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BedDouble, Plus } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { SwipeRow } from "@/components/ui/swipe-row";
import { pricePerNight, stayNights, tripNights } from "@/lib/calc";
import { STATUSES } from "@/lib/constants";
import { formatDay, formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalDate, optionalNumber, optionalText, requiredText, statusField, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Stay = Row<"stays">;
const byCheckIn = (a: Stay, b: Stay) =>
  (a.check_in ?? "9").localeCompare(b.check_in ?? "9") || a.created_at.localeCompare(b.created_at);

export function Stays() {
  const trip = useTrip();
  const { data: stays = [], isPending } = useRows("stays", byCheckIn);
  const update = useUpdateRow("stays", "stay");
  const remove = useDeleteRow("stays", "stay");
  const sheet = useSheet<Stay>();
  const cur = trip.home_currency;

  const active = stays.filter((s) => s.status !== "Cancelled");
  const total = active.reduce((s, x) => s + Number(x.total ?? 0), 0);
  const nights = active.reduce((s, x) => s + (stayNights(x.check_in, x.check_out) ?? 0), 0);
  const needed = tripNights(trip.start_date, trip.end_date);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <CardTitle>Stays</CardTitle>
          {stays.length > 0 && (
            <p className="mt-0.5 text-sm text-fg-muted">
              {formatMoney(total, cur)} · {nights} {nights === 1 ? "night" : "nights"}
              {needed !== null && ` of ${needed}`}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={sheet.openAdd}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-32" />
      ) : stays.length === 0 ? (
        <p className="py-3 text-sm text-fg-muted">Plan where you&rsquo;ll sleep each night and track bookings.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {stays.map((s) => {
            const n = stayNights(s.check_in, s.check_out);
            const ppn = pricePerNight(s.total, n);
            return (
              <SwipeRow
                key={s.id}
                label={`${s.hotel}, ${s.city ?? ""}. Edit`}
                onOpen={() => sheet.openEdit(s)}
                onSwipeDelete={() => remove(s, s.hotel)}
                trailing={
                  <StatusChip
                    status={s.status}
                    label={s.hotel}
                    onChange={(status) => update.mutate({ id: s.id, patch: { status } })}
                  />
                }
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/15 text-primary">
                  <BedDouble className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.hotel}</span>
                  <span className="block truncate text-sm text-fg-muted">
                    {[s.city, s.room].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block text-xs text-fg-muted tabular-nums">
                    {s.check_in
                      ? `${formatDay(s.check_in, "d MMM")} → ${formatDay(s.check_out, "d MMM")}`
                      : "Dates not set"}
                    {n !== null && ` · ${n} ${n === 1 ? "night" : "nights"}`}
                  </span>
                  {s.total !== null && (
                    <span className="block text-xs font-semibold tabular-nums">
                      {formatMoney(s.total, cur)}
                      {ppn !== null && (
                        <span className="font-normal text-fg-muted"> · {formatMoney(ppn, cur)}/night</span>
                      )}
                    </span>
                  )}
                </span>
              </SwipeRow>
            );
          })}
        </ul>
      )}
      <StaySheet sheet={sheet} />
    </Card>
  );
}

const Schema = z
  .object({
    status: statusField,
    city: optionalText(80),
    hotel: requiredText("Hotel", 120),
    room: optionalText(120),
    check_in: optionalDate,
    check_out: optionalDate,
    total: optionalNumber({ min: 0 }),
    confirmation: optionalText(60),
    note: optionalText(500),
  })
  .refine((v) => !v.check_in || !v.check_out || v.check_out >= v.check_in, {
    path: ["check_out"],
    message: "Check-out must be on or after check-in",
  });
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;

export function StaySheet({ sheet }: { sheet: ReturnType<typeof useSheet<Stay>> }) {
  const trip = useTrip();
  const insert = useInsertRow("stays", "stay");
  const update = useUpdateRow("stays", "stay");
  const remove = useDeleteRow("stays", "stay");
  const { register, handleSubmit, reset, formState, control } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      status: (r?.status as In["status"]) ?? "Planned",
      city: str(r?.city),
      hotel: r?.hotel ?? "",
      room: str(r?.room),
      check_in: str(r?.check_in),
      check_out: str(r?.check_out),
      total: str(r?.total),
      confirmation: str(r?.confirmation),
      note: str(r?.note),
    });
  }, [sheet.open, sheet.row, reset]);

  const [cin, cout, totalStr] = useWatch({ control, name: ["check_in", "check_out", "total"] });
  const n = stayNights(cin || null, cout || null);
  const ppn = pricePerNight(totalStr ? Number(totalStr.replace(/,/g, "")) : null, n);

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: v });
    else insert.mutate([{ id: newId(), ...v }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit stay" : "Add stay"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.hotel);
              sheet.close();
            }
          : undefined
      }
    >
      <Field label="Hotel" error={errors.hotel?.message}>
        {(p) => <Input {...p} {...register("hotel")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors.city?.message}>
          {(p) => <Input {...p} {...register("city")} autoComplete="off" />}
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
      <Field label="Room" error={errors.room?.message}>
        {(p) => <Input {...p} {...register("room")} autoComplete="off" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in" error={errors.check_in?.message}>
          {(p) => <Input {...p} type="date" {...register("check_in")} />}
        </Field>
        <Field label="Check-out" error={errors.check_out?.message}>
          {(p) => <Input {...p} type="date" {...register("check_out")} />}
        </Field>
      </div>
      <Field
        label={`Total (${trip.home_currency})`}
        error={errors.total?.message}
        hint={
          n !== null
            ? `${n} ${n === 1 ? "night" : "nights"}${ppn !== null ? ` · ${formatMoney(ppn, trip.home_currency)} per night` : ""}`
            : undefined
        }
      >
        {(p) => <Input {...p} {...register("total")} inputMode="decimal" />}
      </Field>
      <Field label="Confirmation no." error={errors.confirmation?.message}>
        {(p) => <Input {...p} {...register("confirmation")} autoComplete="off" className="font-mono" />}
      </Field>
      <Field label="Note" error={errors.note?.message}>
        {(p) => <Textarea {...p} {...register("note")} rows={2} />}
      </Field>
    </RowSheet>
  );
}
