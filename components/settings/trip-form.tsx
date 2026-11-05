"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { tripLength } from "@/lib/calc";
import { formatDay } from "@/lib/format";
import { useUpdateTrip, type Trip } from "@/lib/queries/trip";
import {
  COMMON_CURRENCIES,
  currencyCode,
  MAP_REGIONS,
  mapRegion,
  optionalDate,
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
  str,
} from "@/lib/schemas";
import { errorMessage } from "@/lib/utils";

const TripSchema = z
  .object({
    name: requiredText("Trip name", 80),
    destination: optionalText(80),
    start_date: optionalDate,
    end_date: optionalDate,
    home_currency: currencyCode,
    foreign_currency: currencyCode,
    rate: requiredNumber("Exchange rate", { gt: 0 }),
    budget: optionalNumber({ min: 0 }).transform((v) => v ?? 0),
    map_region: mapRegion,
    rate_date: optionalDate,
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "End date must be on or after the start date",
  });

type FormIn = z.input<typeof TripSchema>;
type FormOut = z.output<typeof TripSchema>;

const toForm = (t: Trip): FormIn => ({
  name: t.name,
  destination: str(t.destination),
  start_date: str(t.start_date),
  end_date: str(t.end_date),
  home_currency: t.home_currency,
  foreign_currency: t.foreign_currency,
  rate: str(t.rate),
  budget: str(t.budget),
  map_region: t.map_region,
  rate_date: str(t.rate_date),
});

export function TripForm() {
  const trip = useTrip();
  const update = useUpdateTrip();
  const [fetchingRate, setFetchingRate] = useState(false);

  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(TripSchema), defaultValues: toForm(trip) });
  const { register, handleSubmit, formState, setValue, reset, control } = form;
  const errors = formState.errors;

  // Pick up changes saved elsewhere (another phone, later via realtime) unless the user is mid-edit.
  useEffect(() => {
    if (!formState.isDirty) reset(toForm(trip));
  }, [trip, reset, formState.isDirty]);

  const [home, foreign, rateStr, start, end, rateDate] = useWatch({
    control,
    name: ["home_currency", "foreign_currency", "rate", "start_date", "end_date", "rate_date"],
  });
  const rate = Number(rateStr);
  const len = tripLength(start || null, end || null);

  async function fetchLiveRate() {
    setFetchingRate(true);
    try {
      const res = await fetch(
        `/api/rate?from=${encodeURIComponent(foreign.toUpperCase())}&to=${encodeURIComponent(home.toUpperCase())}`,
      );
      const body = (await res.json()) as { rate?: number; date?: string; error?: string };
      if (!res.ok || body.rate === undefined) throw new Error(body.error ?? "No rate returned");
      setValue("rate", String(Number(body.rate.toPrecision(6))), { shouldDirty: true, shouldValidate: true });
      setValue("rate_date", body.date ?? "", { shouldDirty: true });
      toast.success(`Live rate from ${formatDay(body.date, "d MMM yyyy")}. Save to keep it.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setFetchingRate(false);
    }
  }

  const onSubmit = handleSubmit((values) => {
    const patch = values;
    update.mutate(
      { id: trip.id, patch },
      {
        onSuccess: () => {
          toast.success("Trip settings saved");
          reset(toForm({ ...trip, ...patch }));
        },
      },
    );
  });

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <CardTitle>Trip</CardTitle>
        <Field label="Trip name" error={errors.name?.message}>
          {(p) => <Input {...p} {...register("name")} autoComplete="off" />}
        </Field>
        <Field label="Destination" error={errors.destination?.message}>
          {(p) => <Input {...p} {...register("destination")} placeholder="e.g. Vietnam" autoComplete="off" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" error={errors.start_date?.message}>
            {(p) => <Input {...p} type="date" {...register("start_date")} />}
          </Field>
          <Field label="End" error={errors.end_date?.message}>
            {(p) => <Input {...p} type="date" {...register("end_date")} />}
          </Field>
        </div>
        {len !== null && (
          <p className="-mt-2 text-sm text-fg-muted">
            {len} {len === 1 ? "day" : "days"} · {len - 1} {len - 1 === 1 ? "night" : "nights"}
          </p>
        )}

        <CardTitle className="pt-2">Money</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Home currency" error={errors.home_currency?.message}>
            {(p) => (
              <Input
                {...p}
                {...register("home_currency")}
                list="currencies"
                maxLength={3}
                className="uppercase"
                autoCapitalize="characters"
              />
            )}
          </Field>
          <Field label="Foreign currency" error={errors.foreign_currency?.message}>
            {(p) => (
              <Input
                {...p}
                {...register("foreign_currency")}
                list="currencies"
                maxLength={3}
                className="uppercase"
                autoCapitalize="characters"
              />
            )}
          </Field>
        </div>
        <datalist id="currencies">
          {COMMON_CURRENCIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <Field
          label={`Exchange rate: 1 ${foreign.toUpperCase() || "foreign"} = ? ${home.toUpperCase() || "home"}`}
          error={errors.rate?.message}
          hint={
            rate > 0
              ? `1 ${home.toUpperCase()} ≈ ${(1 / rate).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${foreign.toUpperCase()}${
                  rateDate ? ` · live rate from ${formatDay(rateDate, "d MMM yyyy")}` : ""
                }`
              : undefined
          }
        >
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                {...register("rate", { onChange: () => setValue("rate_date", "") })}
                inputMode="decimal"
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={fetchLiveRate} disabled={fetchingRate}>
                {fetchingRate ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                Live rate
              </Button>
            </div>
          )}
        </Field>

        <Field label={`Total budget (${home.toUpperCase()})`} error={errors.budget?.message}>
          {(p) => <Input {...p} {...register("budget")} inputMode="decimal" placeholder="0" />}
        </Field>

        <Field
          label="Map region"
          error={errors.map_region?.message}
          hint="A country code (VN, JP, PH), a region from the list, or world."
        >
          {(p) => <Input {...p} {...register("map_region")} list="regions" autoComplete="off" />}
        </Field>
        <datalist id="regions">
          {MAP_REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </datalist>

        <div className="flex justify-end gap-2 pt-1">
          {formState.isDirty && (
            <Button type="button" variant="ghost" onClick={() => reset(toForm(trip))}>
              Discard
            </Button>
          )}
          <Button type="submit" disabled={!formState.isDirty || update.isPending}>
            Save trip
          </Button>
        </div>
      </form>
    </Card>
  );
}
