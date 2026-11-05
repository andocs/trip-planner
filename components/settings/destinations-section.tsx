"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LocateFixed, MapPinPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyHint, List, ListButton } from "@/components/ui/list";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalNumber, optionalText, requiredText, str } from "@/lib/schemas";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";
import { errorMessage } from "@/lib/utils";

const Schema = z.object({
  city: requiredText("City", 80),
  country: optionalText(80),
  nights: optionalNumber({ min: 0, max: 365, int: true }).transform((v) => v ?? 0),
  lat: optionalNumber({ min: -90, max: 90 }),
  lng: optionalNumber({ min: -180, max: 180 }),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
type Dest = Row<"destinations">;

export function DestinationsSection() {
  const { data: dests, isPending } = useRows("destinations", bySort);
  const sheet = useSheet<Dest>();
  const totalNights = (dests ?? []).reduce((s, d) => s + d.nights, 0);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Destinations</CardTitle>
        <Button variant="ghost" size="sm" onClick={sheet.openAdd}>
          <MapPinPlus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-14" />
      ) : dests?.length ? (
        <>
          <List className="mt-2">
            {dests.map((d, i) => (
              <ListButton
                key={d.id}
                leading={
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal/15 font-bold text-primary">
                    {i + 1}
                  </span>
                }
                title={[d.city, d.country].filter(Boolean).join(", ")}
                subtitle={`${d.nights} ${d.nights === 1 ? "night" : "nights"}${d.lat === null || d.lng === null ? " · no coordinates" : ""}`}
                onClick={() => sheet.openEdit(d)}
                label={`Edit ${d.city}`}
              />
            ))}
          </List>
          <p className="mt-2 text-sm text-fg-muted">{totalNights} nights in total</p>
        </>
      ) : (
        <EmptyHint>Add the cities you&rsquo;ll stay in, in order. They appear on the map sized by nights.</EmptyHint>
      )}
      <DestinationSheet sheet={sheet} sort={nextSort(dests)} />
    </Card>
  );
}

function DestinationSheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Dest>>; sort: number }) {
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
