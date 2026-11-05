"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";
import { errorMessage } from "@/lib/utils";

type Dest = Row<"destinations">;

const Schema = z.object({
  city: requiredText("City", 80),
  country: optionalText(80),
  nights: optionalNumber({ min: 0, max: 365, int: true }).transform((v) => v ?? 0),
  lat: optionalNumber({ min: -90, max: 90 }),
  lng: optionalNumber({ min: -180, max: 180 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
export function DestinationSheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Dest>>; sort: number }) {
  const insert = useInsertRow("destinations", "destination");
  const update = useUpdateRow("destinations", "destination");
  const remove = useDeleteRow("destinations", "destination");
  const [locating, setLocating] = useState(false);
  const [keepAdding, setKeepAdding] = useState(false);
  const { register, handleSubmit, reset, formState, getValues, setValue } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      city: r?.city ?? "",
      country: str(r?.country),
      nights: str(r?.nights),
      lat: str(r?.lat),
      lng: str(r?.lng),
    });
  }, [sheet.open, sheet.row, reset]);

  async function findCoordinates() {
    const q = [getValues("city"), getValues("country")].filter((s) => s?.trim()).join(", ");
    if (!q) return toast.error("Type a city first");
    setLocating(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as { lat?: number; lng?: number; country?: string | null; error?: string };
      if (!res.ok || body.lat === undefined || body.lng === undefined) throw new Error(body.error ?? "Not found");
      setValue("lat", String(body.lat), { shouldDirty: true, shouldValidate: true });
      setValue("lng", String(body.lng), { shouldDirty: true, shouldValidate: true });
      if (!getValues("country") && body.country) setValue("country", body.country, { shouldDirty: true });
      toast.success(`Found ${q}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  const onSubmit = handleSubmit((v) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v });
      sheet.close();
    } else {
      insert.mutate([{ id: newId(), ...v, sort }]);
      if (keepAdding) reset({ city: "", country: getValues("country"), nights: "", lat: "", lng: "" });
      else sheet.close();
    }
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit destination" : "Add destination"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.city);
              sheet.close();
            }
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" error={errors.city?.message}>
          {(p) => <Input {...p} {...register("city")} autoComplete="off" />}
        </Field>
        <Field label="Country" error={errors.country?.message}>
          {(p) => <Input {...p} {...register("country")} autoComplete="off" />}
        </Field>
      </div>
      <Field label="Nights" error={errors.nights?.message}>
        {(p) => <Input {...p} {...register("nights")} type="number" inputMode="numeric" min={0} step={1} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" error={errors.lat?.message}>
          {(p) => <Input {...p} {...register("lat")} inputMode="decimal" placeholder="21.0285" />}
        </Field>
        <Field label="Longitude" error={errors.lng?.message}>
          {(p) => <Input {...p} {...register("lng")} inputMode="decimal" placeholder="105.8542" />}
        </Field>
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={findCoordinates} disabled={locating}>
        {locating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <LocateFixed className="size-4" aria-hidden />
        )}
        Find coordinates
      </Button>
      <p className="text-xs text-fg-muted">Search by OpenStreetMap Nominatim.</p>
    </RowSheet>
  );
}
