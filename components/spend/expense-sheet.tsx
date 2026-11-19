"use client";

import { CalendarDays, Coins, Receipt, Users } from "lucide-react";
import { ChipGroup } from "@/components/ideas/chips";
import { expenseShares, parseSplit, specToStore, splitProblem, type SplitSpec } from "@/lib/split";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormGroup } from "@/components/ui/form-group";
import { RowSheet } from "@/components/ui/row-sheet";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "sonner";
import { daysBetween, homeAmount, localISODate } from "@/lib/calc";
import { expenseDefaults, type LoggableKind } from "@/lib/log-expense";
import { formatMoney } from "@/lib/format";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import type { Stay } from "@/lib/stays";
import { optionalNumber, optionalText, requiredNumber, requiredText, str } from "@/lib/schemas";
import type { useSheet } from "@/lib/use-sheet";

const Schema = z.object({
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  description: requiredText("Description", 120),
  category_id: z.string().transform((v) => (v === "" ? null : v)),
  paid_by: z.string().transform((v) => (v === "" ? null : v)),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: requiredNumber("Amount").refine((v) => v !== 0, "Amount can't be zero"),
  // This expense's own exchange rate (foreign currency only). Empty means the trip's rate.
  rate: optionalNumber({ min: 0.00000001 }),
  note: optionalText(500),
  // How the bill is shared (see lib/split.ts). Everyone, equally, no service charge is the default and stores nothing.
  split_mode: z.enum(["equal", "percent", "amount"]),
  split_members: z.array(z.string()),
  split_shares: z.record(z.string(), z.string()),
  service_pct: z.string(),
  service_split: z.enum(["proportional", "equal"]),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
type Expense = Row<"expenses">;

const round1 = (n: number) => Math.round(n * 100) / 100;
const sumShares = (ids: string[], shares: Record<string, string>) => ids.reduce((s, id) => s + (Number(String(shares[id] ?? "").replace(/,/g, "")) || 0), 0);

/** The form's split fields for a stored split (or the default: everyone, equally, no service charge). */
function splitDefaults(raw: unknown, everyone: string[]) {
  const spec = parseSplit(raw);
  return {
    split_mode: (spec?.mode ?? "equal") as "equal" | "percent" | "amount",
    split_members: spec ? spec.members : everyone,
    split_shares: Object.fromEntries(Object.entries(spec?.shares ?? {}).map(([k, v]) => [k, String(v)])),
    service_pct: spec?.servicePct ? String(spec.servicePct) : "",
    service_split: spec?.serviceSplit ?? ("proportional" as const),
  };
}

/** What the form says so far, as a split spec, for the live preview (people with no number yet count as 0). */
function splitPreview(mode: "equal" | "percent" | "amount", members: string[], shares: Record<string, string>, pct: string, svc: "proportional" | "equal"): SplitSpec {
  const n = Number(pct.replace(/,/g, ""));
  return {
    mode,
    members,
    ...(mode === "equal" ? {} : { shares: Object.fromEntries(members.map((m) => [m, Number(String(shares[m] ?? "").replace(/,/g, "")) || 0])) }),
    ...(n > 0 ? { servicePct: n, serviceSplit: svc } : {}),
  };
}

export function ExpenseSheet({
  sheet,
  categories,
  travelers,
  source,
}: {
  sheet: ReturnType<typeof useSheet<Expense>>;
  categories: Row<"categories">[];
  travelers: Row<"travelers">[];
  /** "Log as expense" from a booked flight or stay: the form opens prefilled from it, and the expense remembers it (once). */
  source?: { kind: LoggableKind; item: Row<"flights"> | Stay };
}) {
  const trip = useTrip();
  const insert = useInsertRow("expenses", "expense");
  const update = useUpdateRow("expenses", "expense");
  const remove = useDeleteRow("expenses", "expense");
  const [keepAdding, setKeepAdding] = useState(true);

  const { register, handleSubmit, reset, formState, control, getValues, setFocus, setError, clearErrors } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    const logged = !r && source ? expenseDefaults(source.kind, source.item, categories, localISODate()) : null;
    reset({
      spent_on: r?.spent_on ?? logged?.spent_on ?? localISODate(),
      description: r?.description ?? logged?.description ?? "",
      category_id: r?.category_id ?? logged?.category_id ?? "",
      paid_by: r?.paid_by ?? "",
      currency: r?.currency ?? trip.home_currency,
      amount: str(r?.amount) || logged?.amount || "",
      rate: str(r?.rate),
      note: str(r?.note),
      ...splitDefaults(r?.split, travelers.map((t) => t.id)),
    });
    // categories and the source only matter when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.open, sheet.row, reset, trip.home_currency]);

  const [currency, amountStr, rawRate, rawMode, rawMembers, rawShares, rawPct, rawSvc] = useWatch({
    control,
    name: ["currency", "amount", "rate", "split_mode", "split_members", "split_shares", "service_pct", "service_split"],
  });
  // Until the form has been filled in for this sheet these are undefined.
  const splitMode = rawMode ?? "equal";
  const splitMembers = rawMembers ?? [];
  const splitShares = rawShares ?? {};
  const servicePct = rawPct ?? "";
  const serviceSplit = rawSvc ?? "proportional";
  const nameOf = (id: string) => travelers.find((t) => t.id === id)?.name ?? "?";
  const amount = Number(String(amountStr ?? "").replace(/,/g, ""));
  const isForeign = currency === trip.foreign_currency;
  const showConversion = isForeign && amountStr && Number.isFinite(amount);
  const ownRate = Number(String(rawRate ?? "").replace(/,/g, ""));
  const usedRate = ownRate > 0 ? ownRate : Number(trip.rate);
  // The trip rate is one number for the whole trip; say so when it is old, so a stale one is not trusted silently.
  const rateAge = trip.rate_date ? daysBetween(trip.rate_date, localISODate()) : null;
  const rateStale = rateAge !== null && rateAge > 30;

  // The pill offers the trip's two currencies, plus an old one if this expense used it.
  const currencies = [
    ...new Set([trip.home_currency, trip.foreign_currency, sheet.row?.currency].filter(Boolean)),
  ] as string[];

  const onSubmit = handleSubmit((v) => {
    const { split_mode, split_members, split_shares, service_pct, service_split, ...columns } = v;
    // Who shares it and how. Equal between everyone with no service charge stores nothing (null).
    const pct = Number(service_pct.replace(/,/g, ""));
    const everyone = travelers.map((t) => t.id);
    const chosen = split_mode === "equal" ? split_members : split_members.filter((m) => split_shares[m] !== undefined && split_shares[m] !== "");
    const spec: SplitSpec = {
      mode: split_mode,
      members: chosen,
      ...(split_mode === "equal" ? {} : { shares: Object.fromEntries(chosen.map((m) => [m, Number(String(split_shares[m]).replace(/,/g, ""))])) }),
      ...(pct > 0 ? { servicePct: pct, serviceSplit: service_split } : {}),
    };
    const problem = travelers.length > 0 ? splitProblem(spec, Math.abs(columns.amount)) : null;
    if (problem) return setError("split_mode", { message: problem });
    const split = travelers.length > 0 ? specToStore(spec, everyone) : null;
    // A rate only means something on a foreign-currency expense.
    const v2 = { ...columns, rate: columns.currency === trip.foreign_currency ? columns.rate : null, split: split as never };
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: v2 });
      sheet.close();
      return;
    }
    insert.mutate([{ id: newId(), ...v2, ...(source ? { source_table: source.kind, source_id: source.item.id } : {}) }]);
    if (source) {
      toast.success("Logged as an expense.");
      sheet.close();
      return;
    }
    if (keepAdding) {
      const keep = getValues();
      // The next expense starts as an equal split again; the rest (date, payer, currency) is kept.
      reset({ ...keep, description: "", amount: "", rate: "", note: "", ...splitDefaults(null, travelers.map((t) => t.id)) });
      setFocus("description");
    } else sheet.close();
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={source ? "Log as expense" : sheet.row ? "Edit expense" : "Add expense"}
      description={source ? "This counts toward Spent once. The booking will show “Logged”." : undefined}
      mode={sheet.mode}
      onSubmit={onSubmit}
      submitLabel={source ? "Log expense" : sheet.row ? "Save" : "Add expense"}
      keepAdding={source ? undefined : { value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `“${sheet.row!.description}”`);
              sheet.close();
            }
          : undefined
      }
    >
      <FormGroup icon={Coins} title="Amount">
        <Field label="Amount" error={errors.amount?.message ?? errors.currency?.message}>
          {(p) => (
            <div className="space-y-2">
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Segmented
                    label="Currency"
                    value={field.value}
                    onChange={field.onChange}
                    options={currencies.map((c) => ({ value: c, label: c }))}
                    className="w-full"
                  />
                )}
              />
              <Input
                {...p}
                {...register("amount")}
                inputMode="decimal"
                placeholder="0.00"
                className="text-2xl font-bold tabular-nums"
              />
              <p className="min-h-5 text-sm text-fg-muted" aria-live="polite">
                {showConversion
                  ? `≈ ${formatMoney(homeAmount({ currency, amount, rate: ownRate > 0 ? ownRate : null }, trip), trip.home_currency)} at ${usedRate}${ownRate > 0 ? " (this expense)" : ""}`
                  : ""}
              </p>
            </div>
          )}
        </Field>
        {isForeign && (
          <Field
            label={`Rate for this expense (optional)`}
            error={errors.rate?.message}
            hint={
              rateStale
                ? `Leave empty to use the trip rate, ${Number(trip.rate)} ${trip.home_currency} per ${trip.foreign_currency}. It was set ${rateAge} days ago: check it in Settings, or enter today's rate here.`
                : `Leave empty to use the trip rate, ${Number(trip.rate)} ${trip.home_currency} per ${trip.foreign_currency}.`
            }
          >
            {(p) => <Input {...p} {...register("rate")} inputMode="decimal" placeholder={String(Number(trip.rate))} />}
          </Field>
        )}
      </FormGroup>

      <FormGroup icon={Receipt} title="What it was for">
        <Field label="Description" error={errors.description?.message}>
          {(p) => <Input {...p} {...register("description")} autoComplete="off" placeholder="e.g. Pho for two" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {(p) => (
              <Select {...p} {...register("category_id")}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Paid by">
            {(p) => (
              <Select {...p} {...register("paid_by")}>
                <option value="">Not set</option>
                {travelers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </FormGroup>

      {travelers.length > 1 && (
        <FormGroup icon={Users} title="Split">
          <Controller
            control={control}
            name="split_members"
            render={({ field }) => (
              <ChipGroup
                label="Split between"
                options={travelers.map((t) => t.id)}
                value={field.value}
                multi
                display={nameOf}
                onChange={(next) => {
                  clearErrors("split_mode");
                  field.onChange(next);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="split_mode"
            render={({ field }) => (
              <Segmented
                label="How to split"
                value={field.value}
                onChange={(v) => {
                  clearErrors("split_mode");
                  field.onChange(v);
                }}
                className="w-full"
                options={[
                  { value: "equal", label: "Equally" },
                  { value: "percent", label: "By percent" },
                  { value: "amount", label: "By amount" },
                ]}
              />
            )}
          />
          {splitMode !== "equal" && (
            <div className="space-y-2">
              {splitMembers.map((id) => (
                <Field key={id} label={`${nameOf(id)}${splitMode === "percent" ? " (%)" : ` (${currency})`}`}>
                  {(p) => <Input {...p} {...register(`split_shares.${id}`)} inputMode="decimal" placeholder="0" autoComplete="off" />}
                </Field>
              ))}
              <p className="text-[13px] text-fg-muted" aria-live="polite">
                {splitMode === "percent"
                  ? `Total ${round1(sumShares(splitMembers, splitShares))}% of 100%`
                  : `Total ${currency} ${round1(sumShares(splitMembers, splitShares))} of ${currency} ${round1(Math.abs(amount) / (1 + (Number(servicePct) || 0) / 100) || 0)} for the items`}
              </p>
            </div>
          )}
          <Field label="Service charge included (%)" hint="If the bill’s total already has a service charge in it, say how much, and the items are worked out without it.">
            {(p) => <Input {...p} {...register("service_pct")} inputMode="decimal" placeholder="0" autoComplete="off" />}
          </Field>
          {Number(servicePct) > 0 && (
            <Controller
              control={control}
              name="service_split"
              render={({ field }) => (
                <ChipGroup
                  label="Split the service charge"
                  options={["proportional", "equal"]}
                  value={field.value}
                  display={(o) => (o === "equal" ? "Equally" : "In proportion to the items")}
                  onChange={(v) => field.onChange((v as string) || field.value)}
                />
              )}
            />
          )}
          {errors.split_mode?.message && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {errors.split_mode.message}
            </p>
          )}
          {amount > 0 && splitMembers.length > 0 && !errors.split_mode && (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm" aria-live="polite">
              {[...expenseShares(Math.abs(amount), splitPreview(splitMode, splitMembers, splitShares, servicePct, serviceSplit), splitMembers)]
                .map(([id, v]) => `${nameOf(id)} ${v.toFixed(2)}`)
                .join(" · ")}
            </p>
          )}
        </FormGroup>
      )}

      <FormGroup icon={CalendarDays} title="When and notes">
        <Field label="Date" error={errors.spent_on?.message}>
          {(p) => <Input {...p} type="date" {...register("spent_on")} />}
        </Field>
        <Field label="Note" error={errors.note?.message}>
          {(p) => <Textarea {...p} {...register("note")} rows={2} />}
        </Field>
      </FormGroup>
    </RowSheet>
  );
}
