"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bus, Clock, Coins, Link2, Plane, PlaneLanding, PlaneTakeoff, Ticket } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LogExpenseRow } from "@/components/plan/log-expense";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select } from "@/components/ui/field";
import { FormGroup } from "@/components/ui/form-group";
import { RowSheet } from "@/components/ui/row-sheet";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { STATUSES } from "@/lib/constants";
import { formatDuration, parseDuration } from "@/lib/flights";
import { isValidTimezone, travelMinutes, zoneForAirport, zoneOrDefault } from "@/lib/timezones";
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
  // The zone of each airport. Empty means not set (the flight time is then only shown if typed).
  dep_tz: z.string().refine((v) => v === "" || isValidTimezone(v), "Pick a time zone from the list").transform((v) => (v === "" ? null : v)),
  arr_tz: z.string().refine((v) => v === "" || isValidTimezone(v), "Pick a time zone from the list").transform((v) => (v === "" ? null : v)),
  fare: optionalNumber({ min: 0 }),
  status: statusField,
  terminal: optionalText(10),
  gate: optionalText(10),
  seat: optionalText(10),
  // "3h 40m": worked out from the two times and zones when both zones are set; typing one here overrides it (optional)
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
  const { register, handleSubmit, reset, formState, control, setValue } = useForm<FlightIn, unknown, FlightOut>({
    resolver: zodResolver(FlightSchema),
  });
  const errors = formState.errors;
  const home = zoneOrDefault(trip.timezone);
  const [departsAt, arrivesAt, depTz, arrTz] = useWatch({ control, name: ["departs_at", "arrives_at", "dep_tz", "arr_tz"] });
  const worked = depTz && arrTz && departsAt && arrivesAt ? travelMinutes({ local: departsAt, zone: depTz }, { local: arrivesAt, zone: arrTz }) : null;
  const suggestZone = (field: "dep_tz" | "arr_tz", code: string) => {
    const z = zoneForAirport(code);
    // Only until the zone has been chosen by hand.
    if (z && !formState.dirtyFields[field]) setValue(field, z);
  };

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
      // Home to start with at the departure end; the arrival zone is left open unless the airport code tells us.
      dep_tz: r?.dep_tz ?? zoneForAirport(r?.from_code) ?? zoneOrDefault(trip.timezone),
      arr_tz: r?.arr_tz ?? zoneForAirport(r?.to_code) ?? "",
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
  }, [sheet.open, sheet.row, reset, trip.timezone]);

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
      side
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
      <FormGroup icon={Plane} title="The flight">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Airline" error={errors.airline?.message}>
            {(p) => <Input {...p} {...register("airline")} autoComplete="off" />}
          </Field>
          <Field label="Flight no." error={errors.flight_no?.message}>
            {(p) => <Input {...p} {...register("flight_no")} placeholder="PR 595" autoComplete="off" />}
          </Field>
        </div>
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
            <h4 className="font-display text-[17px] font-extrabold tracking-tight">Money</h4>
            <p className="text-sm text-fg-muted">
              The fare counts toward <b className="text-fg">Planned</b>. Log it as an expense once you have paid, and it
              counts toward <b className="text-fg">Spent</b> too, once.
            </p>
            <LogExpenseRow kind="flights" item={sheet.row} className="pb-0" />
          </div>
        )}
      </FormGroup>

      <FormGroup icon={PlaneTakeoff} title="Departure">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From (airport code)" error={errors.from_code?.message}>
            {(p) => (
              <Input
                {...p}
                {...register("from_code", { onChange: (e) => suggestZone("dep_tz", e.target.value) })}
                placeholder="MNL"
                className="font-mono uppercase"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Departs (local time)" error={errors.departs_at?.message}>
            {(p) => <Input {...p} type="datetime-local" {...register("departs_at")} />}
          </Field>
        </div>
        <Field label="Time zone" error={errors.dep_tz?.message}>
          {(p) => <TimezoneSelect {...p} {...register("dep_tz")} home={home} current={depTz} at={departsAt} unsetLabel="Not set" />}
        </Field>
      </FormGroup>

      <FormGroup icon={PlaneLanding} title="Arrival">
        <div className="grid grid-cols-2 gap-3">
          <Field label="To (airport code)" error={errors.to_code?.message}>
            {(p) => (
              <Input
                {...p}
                {...register("to_code", { onChange: (e) => suggestZone("arr_tz", e.target.value) })}
                placeholder="HAN"
                className="font-mono uppercase"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Arrives (local time)" error={errors.arrives_at?.message}>
            {(p) => <Input {...p} type="datetime-local" {...register("arrives_at")} />}
          </Field>
        </div>
        <Field label="Time zone" error={errors.arr_tz?.message} hint={arrTz ? undefined : "Pick the arrival zone to work out the flight time."}>
          {(p) => <TimezoneSelect {...p} {...register("arr_tz")} home={home} current={arrTz} at={arrivesAt} unsetLabel="Not set" />}
        </Field>
        {depTz && arrTz && departsAt && arrivesAt && (
          <div
            role="status"
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold ${worked ? "bg-teal-tint text-teal" : "bg-warn-tint text-warn-text"}`}
          >
            <Clock className="size-5 shrink-0" aria-hidden />
            <span>
              {worked ? `Flight time ${formatDuration(worked)}` : "Check the times and zones"}
              <small className="block font-medium opacity-90">
                {worked ? "Worked out from the two times and zones" : "The arrival has to be after the departure once the zones are counted."}
              </small>
            </span>
          </div>
        )}
      </FormGroup>

      <FormGroup icon={Ticket} title="Ticket">
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
          hint="Leave empty to use the time worked out from the zones. Type one, like 3h 40m, to override it."
          error={errors.duration?.message}
        >
          {(p) => <Input {...p} {...register("duration")} placeholder={worked ? formatDuration(worked) : "3h 40m"} autoComplete="off" />}
        </Field>
        <Field
          label="Booking reference"
          hint="Only you can see this. Viewers see it hidden."
          error={errors.booking_ref?.message}
        >
          {(p) => <Input {...p} {...register("booking_ref")} autoComplete="off" className="font-mono" />}
        </Field>
      </FormGroup>
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
      side
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
      <FormGroup icon={Bus} title="The transfer">
        <Field label="Route" error={errors.route?.message}>
          {(p) => <Input {...p} {...register("route")} placeholder="Hanoi → Sapa (sleeper bus)" autoComplete="off" />}
        </Field>
        <Field label="Provider" error={errors.provider?.message}>
          {(p) => <Input {...p} {...register("provider")} autoComplete="off" />}
        </Field>
      </FormGroup>

      <FormGroup icon={Coins} title="Cost">
        <Field label="Cost" error={errors.cost_text?.message} hint="Free text, e.g. “PHP 2,312.04 total”">
          {(p) => <Input {...p} {...register("cost_text")} autoComplete="off" />}
        </Field>
      </FormGroup>

      <FormGroup icon={Link2} title="Booking link">
        <Field label="Link" error={errors.link?.message} hint="Optional. Where you booked it or can check it.">
          {(p) => <Input {...p} {...register("link")} type="url" inputMode="url" placeholder="https://" autoComplete="off" />}
        </Field>
      </FormGroup>
    </RowSheet>
  );
}
