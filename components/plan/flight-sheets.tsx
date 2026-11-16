"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LogExpenseRow } from "@/components/plan/log-expense";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { STATUSES } from "@/lib/constants";
import { formatDuration, parseDuration } from "@/lib/flights";
import { useFlightRefs } from "@/lib/queries/flights";
import { qk } from "@/lib/queries/keys";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import {
  optionalDateTime,
  optionalNumber,
  optionalText,
  optionalUrl,
  requiredText,
  statusField,
  str,
} from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Flight = Row<"flights">;
type Transfer = Row<"transfers">;

const FlightSchema = z.object({
  from_code: optionalText(8).transform((v) => v?.toUpperCase() ?? null),
  to_code: optionalText(8).transform((v) => v?.toUpperCase() ?? null),
  airline: optionalText(80),
  flight_no: optionalText(20),
  departs_at: optionalDateTime,
  arrives_at: optionalDateTime,
  fare: optionalNumber({ min: 0 }),
  status: statusField,
  terminal: optionalText(10),
  gate: optionalText(10),
  seat: optionalText(10),
  // "3h 40m": the length of the flight can't be worked out from two local clock times, so it is typed in (optional)
  duration: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v === "" || parseDuration(v) !== null, "Use a format like 3h 40m")
    .transform((v) => (v === "" ? null : parseDuration(v))),
  // Kept in its own owner-only table, not in the flight row (see migration 13).
  booking_ref: optionalText(40),
});
type FlightIn = z.input<typeof FlightSchema>;
type FlightOut = z.output<typeof FlightSchema>;

export function FlightSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Flight>> }) {
  const trip = useTrip();
  const insert = useInsertRow("flights", "flight");
  const update = useUpdateRow("flights", "flight");
  const remove = useDeleteRow("flights", "flight");
  const insertRef = useInsertRow("flight_refs", "booking reference");
  const updateRef = useUpdateRow("flight_refs", "booking reference");
  const { byFlight } = useFlightRefs();
  const qc = useQueryClient();
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
      terminal: str(r?.terminal),
      gate: str(r?.gate),
      seat: str(r?.seat),
      duration: formatDuration(r?.duration_min),
      // the reference from the owner-only table, or an old one that is still in the flight row
      booking_ref: (r && byFlight.get(r.id)?.booking_ref) || str(r?.booking_ref),
    });
    // byFlight is a fresh Map each render; the form only needs its value when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.open, sheet.row, reset]);

  /** Save the reference in flight_refs: add, change or remove it. Errors show as a message, the flight is already saved. */
  const saveRef = (flightId: string, value: string | null) => {
    const existing = byFlight.get(flightId);
    if (value && existing) {
      if (existing.booking_ref !== value) updateRef.mutate({ id: existing.id, patch: { booking_ref: value } });
    } else if (value) {
      insertRef.mutate([{ id: newId(), flight_id: flightId, booking_ref: value }]);
    } else if (existing) {
      void getSupabase()
        .from("flight_refs")
        .delete()
        .eq("id", existing.id)
        .then(({ error }) => {
          if (error) toast.error(`Couldn't remove the booking reference: ${errorMessage(error)}`);
          void qc.invalidateQueries({ queryKey: qk.table("flight_refs", trip.id) });
          void qc.invalidateQueries({ queryKey: qk.table("flights", trip.id) });
        });
    }
  };

  const onSubmit = handleSubmit((v) => {
    const { booking_ref, duration, ...rest } = v;
    const patch = { ...rest, duration_min: duration };
    if (sheet.row) {
      const id = sheet.row.id;
      // an old reference left in the flight row moves to the owner-only table when it is saved
      update.mutate({ id, patch: sheet.row.booking_ref ? { ...patch, booking_ref: null } : patch });
      saveRef(id, booking_ref);
    } else {
      const id = newId();
      insert.mutate([{ id, ...patch }], { onSuccess: () => saveRef(id, booking_ref) });
    }
    sheet.close();
  });

  const money = sheet.row && (sheet.row.status === "Booked" || sheet.row.status === "Done") && sheet.row.fare;

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
        <Field label="Airline" error={errors.airline?.message}>
          {(p) => <Input {...p} {...register("airline")} autoComplete="off" />}
        </Field>
        <Field label="Flight no." error={errors.flight_no?.message}>
          {(p) => <Input {...p} {...register("flight_no")} placeholder="PR 595" autoComplete="off" />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From (airport code)" error={errors.from_code?.message}>
          {(p) => (
            <Input
              {...p}
              {...register("from_code")}
              placeholder="MNL"
              className="font-mono uppercase"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="To (airport code)" error={errors.to_code?.message}>
          {(p) => (
            <Input
              {...p}
              {...register("to_code")}
              placeholder="HAN"
              className="font-mono uppercase"
              autoComplete="off"
            />
          )}
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
      {money && sheet.row && (
        <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
          <h3 className="font-display text-[17px] font-extrabold tracking-tight">Money</h3>
          <p className="text-sm text-fg-muted">
            The fare counts toward <b className="text-fg">Planned</b>. Log it as an expense once you have paid, and it
            counts toward <b className="text-fg">Spent</b> too, once.
          </p>
          <LogExpenseRow kind="flights" item={sheet.row} className="pb-0" />
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Terminal" error={errors.terminal?.message}>
          {(p) => <Input {...p} {...register("terminal")} placeholder="3" autoComplete="off" className="font-mono" />}
        </Field>
        <Field label="Gate" error={errors.gate?.message}>
          {(p) => <Input {...p} {...register("gate")} placeholder="B7" autoComplete="off" className="font-mono" />}
        </Field>
        <Field label="Seat" error={errors.seat?.message}>
          {(p) => <Input {...p} {...register("seat")} placeholder="14A" autoComplete="off" className="font-mono" />}
        </Field>
      </div>
      <Field
        label="Flight time (optional)"
        hint="How long the flight is, like 3h 40m."
        error={errors.duration?.message}
      >
        {(p) => <Input {...p} {...register("duration")} placeholder="3h 40m" autoComplete="off" />}
      </Field>
      <Field
        label="Booking reference"
        hint="Only you can see this. Viewers see it hidden."
        error={errors.booking_ref?.message}
      >
        {(p) => <Input {...p} {...register("booking_ref")} autoComplete="off" className="font-mono" />}
      </Field>
    </RowSheet>
  );
}

// ---------------------------------------------------------------------------

const TransferSchema = z.object({
  route: requiredText("Route", 120),
  provider: optionalText(120),
  cost_text: optionalText(80),
  link: optionalUrl,
});
type TransferIn = z.input<typeof TransferSchema>;
type TransferOut = z.output<typeof TransferSchema>;

export function TransferSheet({ sheet }: { sheet: ReturnType<typeof useSheet<Transfer>> }) {
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
