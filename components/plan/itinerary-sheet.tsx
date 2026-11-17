"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BedDouble, Check, ChevronDown, ChevronRight, Clock, Landmark, Utensils, Lightbulb, Link2, MapPin, NotebookText } from "lucide-react";
import { useEffect, useState } from "react";
import { IdeaPhotos } from "@/components/photos/idea-photos";
import { useImages, usePhotoUrls, useRemovePhoto } from "@/lib/queries/images";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ChipGroup, ToggleRow } from "@/components/ideas/chips";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormGroup } from "@/components/ui/form-group";
import { RowSheet } from "@/components/ui/row-sheet";
import { tripLength } from "@/lib/calc";
import { KIND_LABEL, TABLE_OF_KIND, type Idea, type IdeaKind } from "@/lib/drafts";
import { toast } from "sonner";
import { formatDay } from "@/lib/format";
import { CategoryGlyph, CategoryMenu } from "./category-menu";
import { kindOfType, placeOf, withPlace } from "@/lib/activity-details";
import { FoodSection, SightSection, StaySection } from "@/components/ideas/idea-modal";
import { blankForm, FORM_SCHEMA, formFromIdea, toPayload, type IdeaFormValues } from "@/lib/idea-form";
import { dateForDay, itineraryUsage, stopLinks, usageLabel, withStopLinks, type InsertPlan } from "@/lib/itinerary";
import { Button } from "@/components/ui/button";
import { useIdeas } from "@/lib/queries/ideas";
import { placeAtEndOfDay, useMoveItems } from "@/lib/queries/itinerary";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { optionalMapsUrl, optionalNumber, optionalText, optionalUrl, requiredText, str } from "@/lib/schemas";
import type { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

const Schema = z.object({
  /** The day of the trip. The date is worked out from the trip start, so it is never asked for. */
  day: z.string(),
  at_time: z
    .string()
    .refine((v) => v === "" || /^\d{2}:\d{2}/.test(v), "Pick a time")
    .transform((v) => (v === "" ? null : v.slice(0, 5))),
  city: optionalText(80),
  activity: requiredText("Activity", 200),
  type: z.string().transform((v) => (v === "" ? null : v)),
  duration_min: optionalNumber({ min: 0, max: 24 * 60 * 7, int: true }),
  /** Only the Custom length chip: show the minutes box even while it is empty. Never saved. */
  lenCustom: z.boolean(),
  note: optionalText(500),
  website: optionalUrl,
  mapsUrl: optionalMapsUrl,
  done: z.boolean(),
});
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
export type ItineraryItem = Row<"itinerary_items">;

const LENGTHS: [label: string, minutes: string][] = [
  ["30m", "30"],
  ["1h", "60"],
  ["2h", "120"],
  ["3h", "180"],
];
const CATEGORY_ICON = { stay: BedDouble, food: Utensils, sight: Landmark } as const;
const CATEGORY_HINT = {
  stay: "Type, check-in time, cancellation, amenities",
  food: "Cuisine, meal, hours, reservation",
  sight: "Type, tickets, duration, best time, effort",
} as const;
/** A stand-in place to build the details form from the category details kept on an activity. */
const standIn = (kind: IdeaKind, details: unknown): Idea => ({
  table: TABLE_OF_KIND[kind], id: "x", key: "x", kind, name: "", city: null, price: null, priceUnit: null, decision: "draft", note: null, nights: null, total: null, details, dealBreaker: false, created_at: "",
});
const TYPE_OF_KIND = { food: "Food & Drink", stay: "Rest & Stay", sight: "Sightseeing" } as const;

/** Where in a day a new activity goes, and which two places it sits between (when added from a place's "+"). */
export type ActivityDefaults = Partial<Pick<In, "day" | "type">> & {
  plan?: InsertPlan;
  between?: { before: string; after?: string };
};

type Source = { table: Idea["table"]; id: string; tentative: boolean };

export function ItinerarySheet({
  sheet,
  cities,
  defaults,
}: {
  sheet: ReturnType<typeof useSheet<ItineraryItem>>;
  cities: string[];
  /** Prefill for "add": the day you tapped + on, and where in that day (right after a place) the new activity goes. */
  defaults?: ActivityDefaults;
}) {
  const trip = useTrip();
  const all = useRows("itinerary_items").data ?? [];
  const { ideas } = useIdeas();
  const move = useMoveItems();
  // The spot is used once; with "Keep adding" the next ones go to the end of the day.
  const [usedPlan, setUsedPlan] = useState<InsertPlan | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const insert = useInsertRow("itinerary_items", "activity");
  const update = useUpdateRow("itinerary_items", "activity");
  const remove = useDeleteRow("itinerary_items", "activity");
  const [keepAdding, setKeepAdding] = useState(false);
  const [readdFor, setReaddFor] = useState<string | null>(null);
  // An activity that is still being added has no row yet, but its photos need an id: made up front, used when it is saved.
  const [draftId, setDraftId] = useState(() => newId());
  const { byIdea: imagesBy } = useImages();
  const urlOf = usePhotoUrls();
  const discard = useRemovePhoto();
  const { register, handleSubmit, reset, formState, control, getValues, setValue, setFocus } = useForm<In, unknown, Out>({
    resolver: zodResolver(Schema),
  });
  const errors = formState.errors;
  const [day, duration, lenCustom, activityName, typeChip] = useWatch({ control, name: ["day", "duration_min", "lenCustom", "activity", "type"] });
  // The category's own details (type, tickets, cuisine, hours ...) are a second small form with the same fields as a place.
  const dform = useForm<IdeaFormValues>({ defaultValues: blankForm("sight", trip.home_currency) });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const linkedKey = sheet.row?.source_table && sheet.row.source_id ? `${sheet.row.source_table}:${sheet.row.source_id}` : source ? `${source.table}:${source.id}` : "";
  const linked = linkedKey ? ideas.find((i) => i.key === linkedKey) : undefined;
  // A linked place keeps its own category; a hand-added activity takes it from its Type chip (sight is the generic one).
  const category: IdeaKind = linked?.kind ?? kindOfType(typeChip);
  const activityId = sheet.row?.id ?? draftId;
  const photoKey = `itinerary_items:${activityId}`;

  // Every day of the trip, and any day an item already uses (the trip may have been shortened).
  const len = tripLength(trip.start_date, trip.end_date) ?? 0;
  const usage = itineraryUsage(all, trip.start_date);
  const days = new Set<number>();
  for (let d = 1; d <= len; d++) days.add(d);
  for (const i of all) if (i.day !== null) days.add(i.day);
  const dayList = [...days].sort((a, b) => a - b);
  const dayDate = (d: number) => dateForDay(trip.start_date, d);
  const dayNumber = day === undefined || day === "" ? null : Number(day);
  const picked = dayNumber === null ? null : dayDate(dayNumber);

  useEffect(() => {
    if (!sheet.open) return;
    const r = sheet.row;
    reset({
      day: r ? str(r.day) : (defaults?.day ?? ""),
      at_time: r?.at_time?.slice(0, 5) ?? "",
      city: str(r?.city),
      activity: r?.activity ?? "",
      type: r ? (r.type ?? "") : (defaults?.type ?? ""),
      duration_min: str(r?.duration_min),
      lenCustom: !!r?.duration_min && !LENGTHS.some(([, m]) => m === String(r.duration_min)),
      note: str(r?.note),
      website: stopLinks(r?.details).website ?? "",
      mapsUrl: stopLinks(r?.details).mapsUrl ?? "",
      done: r?.done ?? false,
    });
    const rowIdea = r?.source_table && r.source_id ? ideas.find((i) => i.key === `${r.source_table}:${r.source_id}`) : undefined;
    const kind = rowIdea?.kind ?? kindOfType(r ? r.type : defaults?.type);
    const place = placeOf(r?.details);
    dform.reset(place ? formFromIdea(standIn(kind, place), trip.home_currency) : rowIdea ? formFromIdea(rowIdea, trip.home_currency) : blankForm(kind, trip.home_currency));
    // The place list and the details form only matter when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.open, sheet.row, reset, defaults]);

  // The spot only applies while the day is still the one it was tapped on, and only to the first activity.
  const spot = !sheet.row && defaults?.plan && defaults.plan !== usedPlan && (day ?? "") === (defaults.day ?? "") ? defaults.plan : null;

  const onSubmit = handleSubmit((v) => {
    const { day: dayStr, lenCustom: _custom, website, mapsUrl, ...rest } = v;
    void _custom;
    const links = { website, mapsUrl };
    const toDay = dayStr === "" ? null : Number(dayStr);
    // The category's details, in the same shape the board keeps them.
    const checked = (FORM_SCHEMA[category] as z.ZodType).safeParse({ ...dform.getValues(), name: rest.activity, city: rest.city ?? "" });
    if (!checked.success) {
      setDetailsOpen(true);
      toast.error("Check the details section.");
      return;
    }
    const place = toPayload(category as "stay", checked.data as never).columns.details as Record<string, unknown>;
    const fields = { ...rest, details: withPlace(withStopLinks(sheet.row?.details, links), place) as never };
    if (sheet.row) {
      const moved = toDay !== sheet.row.day;
      // Changing the day sends it to the end of the new day; otherwise its place in the day is kept.
      const patch = moved
        ? { ...fields, ...placeAtEndOfDay(all.filter((i) => i.id !== sheet.row!.id), toDay, trip.start_date) }
        : { ...fields, on_date: dateForDay(trip.start_date, toDay) ?? sheet.row.on_date };
      update.mutate({ id: sheet.row.id, patch });
      sheet.close();
      return;
    }
    if (spot?.renumber.length) move.mutate(spot.renumber);
    insert.mutate([
      {
        id: draftId,
        ...fields,
        ...(source ? { source_table: source.table, source_id: source.id, tentative: source.tentative } : {}),
        ...(spot ? { day: toDay, on_date: dateForDay(trip.start_date, toDay), position: spot.position } : placeAtEndOfDay(all, toDay, trip.start_date)),
      },
    ]);
    setDraftId(newId());
    if (spot) setUsedPlan(spot);
    setSource(null);
    setPicking(false);
    if (keepAdding) {
      const keep = getValues();
      reset({ ...keep, activity: "", at_time: "", duration_min: "", lenCustom: false, note: "", website: "", mapsUrl: "", done: false });
      setFocus("activity");
    } else sheet.close();
  });

  /** A category chosen from the menu. A linked place keeps its own category, so choosing another one lets go of the place. */
  const chooseCategory = (label: string) => {
    setValue("type", label, { shouldDirty: true });
    if (linked && kindOfType(label) !== linked.kind) {
      setSource(null);
      dform.reset(blankForm(kindOfType(label), trip.home_currency));
    } else if (!linked) dform.reset({ ...blankForm(kindOfType(label), trip.home_currency), ...dform.getValues(), kind: kindOfType(label) } as IdeaFormValues);
  };

  const pickIdea = (i: Idea) => {
    setReaddFor(null);
    setValue("activity", i.name, { shouldValidate: true });
    setValue("city", i.city ?? "");
    setValue("type", TYPE_OF_KIND[i.kind]);
    setSource({ table: i.table, id: i.id, tentative: i.decision === "draft" });
    dform.reset(formFromIdea(i, trip.home_currency));
    setPicking(false);
    setSearch("");
  };
  const matches = ideas
    .filter((i) => i.decision !== "dropped" && (!typeChip || i.kind === category) && i.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  const lengthChip = lenCustom || (!!duration && !LENGTHS.some(([, m]) => m === duration)) ? "Custom" : (LENGTHS.find(([, m]) => m === duration)?.[0] ?? "");
  const chosenDay = (d: string) => (day ?? "") === d;

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={(o) => {
        // Closing an add without saving: its photos have no activity to belong to, so they go too.
        if (!o && !sheet.row) for (const r of imagesBy.get(`itinerary_items:${draftId}`) ?? []) discard.mutate(r);
        if (!o && !sheet.row) setDraftId(newId());
        sheet.setOpen(o);
      }}
      side
      title={sheet.row ? "Edit activity" : "Add activity"}
      description={[typeChip || null, sheet.row ? null : dayNumber === null ? "No day yet" : `Day ${dayNumber}${picked ? ` · ${formatDay(picked)}` : ""}`].filter(Boolean).join(" · ") || undefined}
      badge={
        sheet.row ? (
          <span className={cn("inline-flex min-h-6 items-center rounded-full px-2 text-xs font-extrabold", sheet.row.tentative ? "bg-warn-tint text-warn-text" : "bg-teal-tint text-teal")}>
            {sheet.row.done ? "Done" : sheet.row.tentative ? "Tentative" : "Planned"}
          </span>
        ) : undefined
      }
      mode={sheet.mode}
      onSubmit={onSubmit}
      keepAdding={{ value: keepAdding, onChange: setKeepAdding }}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, `“${sheet.row!.activity}”`);
              sheet.close();
            }
          : undefined
      }
    >
      {spot && defaults?.between && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-fg-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
          <span>
            {defaults.between.after ? "Goes between " : "Goes after "}
            <b className="text-fg">{defaults.between.before}</b>
            {defaults.between.after && (
              <>
                {" and "}
                <b className="text-fg">{defaults.between.after}</b>
              </>
            )}
            {" on "}
            <b className="text-fg">{`Day ${dayNumber}${picked ? ` · ${formatDay(picked)}` : ""}`}</b>
          </span>
        </p>
      )}
      <FormGroup icon={MapPin} title="The activity">
        <div>
          <span className="mb-1.5 block text-[13px] font-bold text-fg-muted">Category</span>
          <CategoryMenu current={typeChip} onPick={chooseCategory}>
            <button type="button" aria-label="Category" className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3.5 text-left transition-colors hover:bg-line">
              <CategoryGlyph label={typeChip} className="size-5 shrink-0 text-teal" />
              <span className={cn("min-w-0 flex-1 font-bold", !typeChip && "text-fg-muted")}>{typeChip || "Choose a category"}</span>
              <ChevronDown className="size-5 shrink-0 text-fg-muted" aria-hidden />
            </button>
          </CategoryMenu>
        </div>
        <Field label="Activity" error={errors.activity?.message}>
          {(p) => <Input {...p} {...register("activity")} autoComplete="off" placeholder="e.g. Train Street coffee" />}
        </Field>
        {!sheet.row && (
          <div>
            <button
              type="button"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-3.5 text-left"
            >
              <Lightbulb className="size-5 shrink-0 text-fg-muted" strokeWidth={2.4} aria-hidden />
              <span className="min-w-0 flex-1 font-bold">
                Pick from your Places
                <small className="block text-[13px] font-medium text-fg-muted">
                  {source ? "Linked to a place on your board" : "Fills in the name, area and price"}
                </small>
              </span>
              <ChevronRight className={cn("size-5 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none", picking && "rotate-90")} aria-hidden />
            </button>
            {picking && (
              <div className="mt-2 space-y-2 rounded-2xl bg-surface-2 p-2.5">
                <Input aria-label="Search your places" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your places" autoComplete="off" />
                {matches.length === 0 ? (
                  <p className="px-1.5 py-2 text-sm text-fg-muted">Nothing on your board matches.</p>
                ) : (
                  <ul>
                    {matches.map((i) => (
                      <li key={i.key}>
                        {readdFor === i.key ? (
                          // Already on the itinerary: ask before adding it a second time.
                          <div className="space-y-2 rounded-xl bg-surface px-3 py-2.5">
                            <p className="text-sm">
                              <b>{i.name}</b> is already on the itinerary ({usageLabel(usage.get(i.key))}). Add it again?
                            </p>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={() => pickIdea(i)}>
                                Add again
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setReaddFor(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => (usage.get(i.key)?.length ? setReaddFor(i.key) : pickIdea(i))}
                            className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-surface"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold">{i.name}</span>
                              {usage.get(i.key)?.length ? (
                                <span className="flex items-center gap-1 text-xs font-bold text-teal">
                                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                                  Already in itinerary · {usageLabel(usage.get(i.key))}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-xs font-bold text-fg-muted">
                              {KIND_LABEL[i.kind]}
                              {i.decision === "draft" ? " · Draft" : ""}
                            </span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <Field label="City or area" error={errors.city?.message}>
          {(p) => <Input {...p} {...register("city")} list="itin-cities" autoComplete="off" />}
        </Field>
        <datalist id="itin-cities">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </FormGroup>

      <FormGroup icon={Clock} title="When">
        <div className="space-y-2">
          <span className="block text-[13px] font-bold text-fg-muted">Day</span>
          <div role="group" aria-label="Day" className="-mx-5 -my-1 flex gap-2 overflow-x-auto px-5 py-1.5 [scrollbar-width:none]">
            {dayList.map((d) => {
              const date = dayDate(d);
              const on = chosenDay(String(d));
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setValue("day", String(d), { shouldDirty: true })}
                  className={cn("min-h-14 shrink-0 rounded-2xl px-3.5 text-left transition-colors", on ? "bg-teal-tint text-teal ring-2 ring-teal" : "bg-surface-2 text-fg")}
                >
                  <b className="block text-[15px]">Day {d}</b>
                  {date && <span className="block text-xs font-medium opacity-80">{formatDay(date)}</span>}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={chosenDay("")}
              onClick={() => setValue("day", "", { shouldDirty: true })}
              className={cn("min-h-14 shrink-0 rounded-2xl px-3.5 text-left transition-colors", chosenDay("") ? "bg-teal-tint text-teal ring-2 ring-teal" : "bg-surface-2 text-fg")}
            >
              <b className="block text-[15px]">Later</b>
              <span className="block text-xs font-medium opacity-80">No day yet</span>
            </button>
          </div>
          {picked && <p className="text-sm text-fg-muted">The date follows from the trip start: {formatDay(picked)}.</p>}
        </div>
        <Field label="Time" hint="Optional" error={errors.at_time?.message}>
          {(p) => <Input {...p} type="time" {...register("at_time")} />}
        </Field>
        <ChipGroup
          label="Length"
          options={[...LENGTHS.map(([l]) => l), "Custom"]}
          value={lengthChip}
          display={(o) => o}
          onChange={(next) => {
            const n = Array.isArray(next) ? (next[0] ?? "") : next;
            if (n === "Custom") return setValue("lenCustom", true);
            setValue("lenCustom", false);
            setValue("duration_min", LENGTHS.find(([l]) => l === n)?.[1] ?? "");
          }}
        />
        {lengthChip === "Custom" && (
          <Field label="Length in minutes" error={errors.duration_min?.message}>
            {(p) => <Input {...p} {...register("duration_min")} inputMode="numeric" placeholder="90" />}
          </Field>
        )}
      </FormGroup>

      <FormGroup icon={CATEGORY_ICON[category]} title={`${KIND_LABEL[category]} details`}>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-label={`${KIND_LABEL[category]} details`}
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 text-left"
        >
          <span className="text-sm font-medium text-fg-muted">{detailsOpen ? "Hide" : CATEGORY_HINT[category]}</span>
          <ChevronDown className={cn("size-5 shrink-0 transition-transform motion-reduce:transition-none", detailsOpen && "rotate-180")} aria-hidden />
        </button>
        {detailsOpen && (
          <div className="space-y-4">
            {category === "stay" && <StaySection control={dform.control} register={dform.register} errors={dform.formState.errors} currency={trip.home_currency} record />}
            {category === "food" && <FoodSection control={dform.control} register={dform.register} errors={dform.formState.errors} />}
            {category === "sight" && <SightSection control={dform.control} register={dform.register} errors={dform.formState.errors} />}
          </div>
        )}
      </FormGroup>

      <FormGroup icon={Link2} title="Links and photos">
        <Field label="Website" hint="Optional" error={errors.website?.message}>
          {(p) => <Input {...p} {...register("website")} type="url" inputMode="url" autoComplete="off" placeholder="https://" />}
        </Field>
        <Field label="Google Maps link" hint="Optional. Paste a share link from Google Maps." error={errors.mapsUrl?.message}>
          {(p) => <Input {...p} {...register("mapsUrl")} type="url" inputMode="url" autoComplete="off" placeholder="https://maps.app.goo.gl/…" />}
        </Field>
        <div className="space-y-2">
          <IdeaPhotos
            idea={{ table: "itinerary_items", id: activityId, key: photoKey, name: activityName?.trim() || "this activity" }}
            images={imagesBy.get(photoKey) ?? []}
            urlOf={urlOf}
            canEdit
          />
        </div>
      </FormGroup>

      <FormGroup icon={NotebookText} title="Notes">
        <Field label="Notes" error={errors.note?.message}>
          {(p) => <Textarea {...p} {...register("note")} rows={2} />}
        </Field>
        {sheet.row && (
          <Controller
            control={control}
            name="done"
            render={({ field }) => <ToggleRow label="Done" hint="Counts toward “done” on Home" checked={field.value} onChange={field.onChange} />}
          />
        )}
      </FormGroup>
    </RowSheet>
  );
}
