"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ChipGroup, ToggleRow } from "@/components/ideas/chips";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Textarea } from "@/components/ui/field";
import { BedDouble, CalendarDays, Link2, ShieldCheck } from "lucide-react";
import { FormGroup } from "@/components/ui/form-group";
import { RowSheet } from "@/components/ui/row-sheet";
import { pricePerNight, stayNights } from "@/lib/calc";
import { STATUSES } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { CANCELLATION } from "@/lib/idea-details";
import { buildStayDetails, parseStayDetails } from "@/lib/stay-details";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalDate, optionalMapsUrl, optionalNumber, optionalText, optionalUrl, requiredText, statusField, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

type Stay = Row<"stays">;

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
    cancellation: z.enum(CANCELLATION).or(z.literal("")),
    freeUntil: optionalDate,
    checkInTime: z.string().refine((v) => v === "" || /^\d{2}:\d{2}$/.test(v), "Use a time like 14:00"),
    breakfast: z.boolean(),
    website: optionalUrl,
    mapsUrl: optionalMapsUrl,
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
    const d = parseStayDetails(r?.details);
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
      cancellation: d.cancellation ?? "",
      freeUntil: d.freeUntil ?? "",
      checkInTime: d.checkInTime ?? "",
      breakfast: d.breakfast ?? false,
      website: d.website ?? "",
      mapsUrl: d.mapsUrl ?? "",
    });
  }, [sheet.open, sheet.row, reset]);

  const [cin, cout, totalStr, cancellation] = useWatch({ control, name: ["check_in", "check_out", "total", "cancellation"] });
  const n = stayNights(cin || null, cout || null);
  const ppn = pricePerNight(totalStr ? Number(totalStr.replace(/,/g, "")) : null, n);

  const onSubmit = handleSubmit((v) => {
    const { cancellation: c, freeUntil, checkInTime, breakfast, website, mapsUrl, ...columns } = v;
    const row = { ...columns, details: buildStayDetails({ cancellation: c, freeUntil, checkInTime, breakfast, website, mapsUrl }) };
    if (sheet.row) update.mutate({ id: sheet.row.id, patch: row });
    else insert.mutate([{ id: newId(), ...row }]);
    sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      side
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
      <FormGroup icon={BedDouble} title="The stay">
        <Field label="Name" error={errors.hotel?.message}>
          {(p) => <Input {...p} {...register("hotel")} autoComplete="off" placeholder="e.g. Old Quarter boutique hotel" />}
        </Field>
        <Field label="Location or area" error={errors.city?.message} hint="A city or neighbourhood.">
          {(p) => <Input {...p} {...register("city")} autoComplete="off" />}
        </Field>
        <Field label="Room" error={errors.room?.message}>
          {(p) => <Input {...p} {...register("room")} autoComplete="off" />}
        </Field>
      </FormGroup>

      <FormGroup icon={CalendarDays} title="Dates and booking">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in" error={errors.check_in?.message}>
            {(p) => <Input {...p} type="date" {...register("check_in")} />}
          </Field>
          <Field label="Check-out" error={errors.check_out?.message}>
            {(p) => <Input {...p} type="date" {...register("check_out")} />}
          </Field>
        </div>
        <Controller
          control={control}
          name="status"
          render={({ field }) => <ChipGroup label="Status" options={STATUSES} value={field.value} onChange={(v) => field.onChange((v as string) || field.value)} />}
        />
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
        <Field label="Confirmation no." error={errors.confirmation?.message} hint="Only you can see this.">
          {(p) => <Input {...p} {...register("confirmation")} autoComplete="off" className="font-mono" />}
        </Field>
      </FormGroup>

      <FormGroup icon={ShieldCheck} title="Cancellation and check-in">
        <Controller
          control={control}
          name="cancellation"
          render={({ field }) => (
            <ChipGroup label="Cancellation" options={CANCELLATION} value={field.value} onChange={(v) => field.onChange(v as string)} />
          )}
        />
        {cancellation === "free" && (
          <Field label="Free until" error={errors.freeUntil?.message} hint="Optional. Adds a reminder on Home before it ends.">
            {(p) => <Input {...p} type="date" {...register("freeUntil")} />}
          </Field>
        )}
        <Field label="Check-in time" error={errors.checkInTime?.message} hint="Optional">
          {(p) => <Input {...p} type="time" {...register("checkInTime")} />}
        </Field>
        <Controller
          control={control}
          name="breakfast"
          render={({ field }) => <ToggleRow label="Breakfast included" checked={field.value} onChange={field.onChange} />}
        />
      </FormGroup>

      <FormGroup icon={Link2} title="Links and notes">
        <Field label="Website" hint="Optional" error={errors.website?.message}>
          {(p) => <Input {...p} {...register("website")} type="url" inputMode="url" autoComplete="off" placeholder="https://" />}
        </Field>
        <Field label="Google Maps link" hint="Optional. Paste a share link from Google Maps." error={errors.mapsUrl?.message}>
          {(p) => <Input {...p} {...register("mapsUrl")} type="url" inputMode="url" autoComplete="off" placeholder="https://maps.app.goo.gl/…" />}
        </Field>
        <Field label="Notes" error={errors.note?.message}>
          {(p) => <Textarea {...p} {...register("note")} rows={2} />}
        </Field>
      </FormGroup>
    </RowSheet>
  );
}
