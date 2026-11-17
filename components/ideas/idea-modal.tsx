"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BedDouble, ChevronDown, ClipboardPaste, Flag, Landmark, Link2, Plus, Utensils } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control, type Resolver, type UseFormRegister } from "react-hook-form";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { FormFooter } from "@/components/ui/form-footer";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { KIND_LABEL, type Idea, type IdeaKind } from "@/lib/drafts";
import { formatMoney } from "@/lib/format";
import {
  AMENITIES,
  BEST_TIMES,
  BOOKING,
  CANCELLATION,
  COST_LABEL,
  CUISINES,
  DIETARY,
  DURATIONS,
  EFFORT,
  MEAL_SLOTS,
  nightsBetween,
  PAYMENT,
  PRICE_BANDS,
  SETTING,
  SIGHT_TYPES,
  STAY_TYPES,
  UNIT_LABEL,
  UNITS,
} from "@/lib/idea-details";
import { blankForm, FORM_SCHEMA, formFromIdea, toPayload, type IdeaFormValues, type IdeaPayload } from "@/lib/idea-form";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow } from "@/lib/queries/table";
import { cn } from "@/lib/utils";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { ChipGroup, ToggleRow } from "./chips";
import { PasteList, type PasteSummary } from "./paste-list";

const KINDS: { value: IdeaKind; icon: typeof BedDouble }[] = [
  { value: "stay", icon: BedDouble },
  { value: "food", icon: Utensils },
  { value: "sight", icon: Landmark },
];
const FORM_ID = "idea-modal-form";
/** The collapsible category details: a title and what is inside. */
const FOLD: Record<IdeaKind, [string, string]> = {
  stay: ["Stay details", "Type, days, cancellation, amenities"],
  food: ["Food details", "Cuisine, meal, hours, reservation"],
  sight: ["Sight details", "Type, tickets, duration, best time, effort"],
};
const menuKey = (s: string) => s.trim().toLowerCase();

export type IdeaModalProps = {
  /** The category to open on (add) or the idea's own (edit). */
  kind: IdeaKind;
  /** Set to edit an existing idea; the category is then fixed. */
  idea?: Idea;
  /** Add mode: start from a name / area that is already known (a Google result). */
  prefill?: { name?: string; city?: string };
  cities: string[];
  onClose: () => void;
  /** Add mode only: take over saving (Discover also saves the Google place link). Call `done` when finished. */
  onCreate?: (payload: IdeaPayload, done: () => void) => void;
  pending?: boolean;
  submitLabel?: string;
  /** Shown above the fields (e.g. what is kept from Google). */
  note?: string;
  /** Add mode only: open on "Paste a list" instead of "One place". */
  startMode?: "one" | "paste";
};

/**
 * The one add/edit form for every idea: a shared shell and category-specific fields for stays, food places and
 * sights. Everything is short inputs, chips and switches. It never calls Google: a name or area that came from a
 * saved Google result is only prefilled. Used from the Places board (add and edit) and from Discover.
 */
export function IdeaModal({ kind: startKind, idea, prefill, cities, onClose, onCreate, pending, submitLabel, note, startMode }: IdeaModalProps) {
  const [kind, setKind] = useState<IdeaKind>(idea?.kind ?? startKind);
  // Switching category (add mode) keeps what was typed in the shared fields.
  const [carry, setCarry] = useState<Partial<IdeaFormValues>>({ name: prefill?.name ?? "", city: prefill?.city ?? "" });
  const editing = !!idea;
  // Keep adding (on by default for places): after a save the name clears and the area and category stay.
  // A save from Discover is for one Google place, so it always closes.
  const canPaste = !editing && !onCreate;
  const [mode, setMode] = useState<"one" | "paste">(canPaste && startMode === "paste" ? "paste" : "one");
  const pasting = canPaste && mode === "paste";
  const [paste, setPaste] = useState<PasteSummary>({ count: 0, pending: false });
  const canKeep = canPaste && !pasting;
  const [keep, setKeep] = useState(true);
  const [round, setRound] = useState(0);
  const finish = (city: string) => {
    if (canKeep && keep) {
      setCarry({ name: "", city });
      setRound((r) => r + 1);
      return;
    }
    onClose();
  };
  const remove = {
    hotel_ideas: useDeleteRow("hotel_ideas", "hotel idea"),
    food_places: useDeleteRow("food_places", "food place"),
    attractions: useDeleteRow("attractions", "attraction"),
  };
  const rows = { hotel_ideas: useRows("hotel_ideas"), food_places: useRows("food_places"), attractions: useRows("attractions") };

  const onDelete = () => {
    if (!idea) return;
    const row = rows[idea.table].data?.find((r) => r.id === idea.id);
    if (!row) return;
    (remove[idea.table] as (r: unknown, d?: string) => void)(row, idea.name);
    onClose();
  };

  return (
    <Sheet
      open
      side
      onOpenChange={(o) => !o && onClose()}
      title={editing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : "Add place"}
      footer={
        <FormFooter
          mode={editing ? "edit" : "add"}
          formId={FORM_ID}
          submitLabel={pasting ? (paste.count > 1 ? `Add ${paste.count} places` : "Add") : submitLabel}
          pending={pasting ? pending || paste.pending || paste.count === 0 : pending}
          onCancel={onClose}
          onDelete={onDelete}
          keepAdding={canKeep ? { value: keep, onChange: setKeep } : undefined}
        />
      }
    >
      {!editing && (
        <Segmented<IdeaKind>
          label="Category"
          value={kind}
          onChange={setKind}
          className="mb-3 flex w-full"
          options={KINDS.map((k) => ({ value: k.value, label: KIND_LABEL[k.value] }))}
        />
      )}
      {canPaste && (
        <Segmented<"one" | "paste">
          label="How many"
          value={mode}
          onChange={setMode}
          className="mb-3 flex w-full"
          options={[
            { value: "one", label: "One place", icon: <Plus className="size-4" strokeWidth={2.6} aria-hidden /> },
            { value: "paste", label: "Paste a list", icon: <ClipboardPaste className="size-4" strokeWidth={2.4} aria-hidden /> },
          ]}
        />
      )}
      {pasting ? (
        <PasteList formId={FORM_ID} kind={kind} cities={cities} onDone={onClose} onSummary={setPaste} />
      ) : (
        <IdeaForm
          key={`${kind}-${round}`}
          kind={kind}
          idea={idea}
          carry={carry}
          onCarry={setCarry}
          cities={cities}
          onDone={finish}
          onCreate={onCreate}
          note={note}
          fromGoogle={!!prefill?.name}
        />
      )}
    </Sheet>
  );
}

function IdeaForm({
  kind,
  idea,
  carry,
  onCarry,
  cities,
  onDone,
  onCreate,
  note,
  fromGoogle,
}: {
  kind: IdeaKind;
  idea?: Idea;
  carry: Partial<IdeaFormValues>;
  onCarry: (c: Partial<IdeaFormValues>) => void;
  cities: string[];
  /** Called after a save with the area that was saved (keep adding reuses it). */
  onDone: (city: string) => void;
  onCreate?: (payload: IdeaPayload, done: () => void) => void;
  note?: string;
  fromGoogle: boolean;
}) {
  const trip = useTrip();
  const home = trip.home_currency;
  const insert = {
    hotel_ideas: useInsertRow("hotel_ideas", "hotel idea"),
    food_places: useInsertRow("food_places", "food place"),
    attractions: useInsertRow("attractions", "attraction"),
  };
  const update = {
    hotel_ideas: useUpdateRow("hotel_ideas", "hotel idea"),
    food_places: useUpdateRow("food_places", "food place"),
    attractions: useUpdateRow("attractions", "attraction"),
  };
  const menu = useRows("menu_items").data ?? [];
  const updateMenu = useUpdateRow("menu_items", "menu item");

  const defaults: IdeaFormValues = idea ? formFromIdea(idea, home) : { ...blankForm(kind, home), ...carry };
  const { register, handleSubmit, control, formState } = useForm<IdeaFormValues>({
    resolver: zodResolver(FORM_SCHEMA[kind]) as unknown as Resolver<IdeaFormValues>,
    defaultValues: defaults,
  });
  const errors = formState.errors;
  // Category details are folded away when adding; editing opens them.
  const [detailsOpen, setDetailsOpen] = useState(!!idea);
  const [name, city] = useWatch({ control, name: ["name", "city"] });

  // Remember the shared fields so a category switch (add mode) does not lose them.
  const remember = () => onCarry({ name, city });

  const onSubmit = handleSubmit((out) => {
    const payload = toPayload(kind as "stay", out as never);
    if (idea) {
      (update[payload.table].mutate as (v: unknown) => void)({ id: idea.id, patch: payload.columns });
      if (kind === "food" && idea.name !== payload.name)
        // Menu items are linked by restaurant name, so carry them over on rename.
        for (const m of menu.filter((x) => menuKey(x.restaurant) === menuKey(idea.name)))
          updateMenu.mutate({ id: m.id, patch: { restaurant: payload.name } });
      onDone(out.city);
      return;
    }
    if (onCreate) return onCreate(payload, () => onDone(out.city));
    (insert[payload.table].mutate as (v: unknown) => void)([{ id: newId(), ...payload.columns, ...payload.insertOnly }]);
    toast.success(payload.columns.decision === "confirmed" ? "Added." : "Added as a draft.");
    onDone(out.city);
  }, (errs) => {
    // An error inside the folded details must not be hidden.
    if (Object.keys(errs).some((k) => !["name", "city", "cost", "currency", "unit", "notes"].includes(k))) setDetailsOpen(true);
  });

  const listId = "idea-areas";
  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4 pt-1 pb-2" noValidate onBlur={remember}>
      {note && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-fg-muted">
          <Link2 className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
          <span>{note}</span>
        </p>
      )}
      <Field label="Name" error={errors.name?.message}>
        {(p) => (
          <Input
            {...p}
            {...register("name")}
            autoComplete="off"
            placeholder={kind === "stay" ? "e.g. Old Quarter boutique hotel" : kind === "food" ? "e.g. Bún chả Hương Liên" : "e.g. Trang An boat tour"}
          />
        )}
      </Field>
      <Field
        label="Location or area"
        error={errors.city?.message}
        hint={fromGoogle ? "Filled from the Google result you picked." : "A city or neighbourhood. Free text."}
      >
        {(p) => <Input {...p} {...register("city")} list={listId} autoComplete="off" />}
      </Field>
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.25fr)_minmax(0,1fr)] items-end gap-3">
        <Field label={COST_LABEL[kind]} error={errors.cost?.message}>
          {(p) => <Input {...p} {...register("cost")} inputMode="decimal" placeholder="0" />}
        </Field>
        <Field label="Per">
          {(p) => (
            <Select {...p} {...register("unit")}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u].replace(/^per /, "")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Currency" error={errors.currency?.message}>
          {(p) => (
            <Select {...p} {...register("currency")}>
              {[...new Set([home, ...COMMON_CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div>
        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex min-h-13 w-full items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 text-left font-bold"
        >
          <span>
            {FOLD[kind][0]}
            <small className="block text-[13px] font-medium text-fg-muted">{FOLD[kind][1]}</small>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 transition-transform motion-reduce:transition-none", detailsOpen && "rotate-180")} aria-hidden />
        </button>
        {detailsOpen && (
          <div className="mt-4 space-y-4">
            {kind === "stay" && <StaySection control={control} register={register} errors={errors} currency={home} />}
            {kind === "food" && <FoodSection control={control} register={register} errors={errors} />}
            {kind === "sight" && <SightSection control={control} register={register} errors={errors} />}
          </div>
        )}
      </div>

      <Field label="Website" hint="Optional" error={errors.website?.message}>
        {(p) => <Input {...p} {...register("website")} type="url" inputMode="url" autoComplete="off" placeholder="https://" />}
      </Field>
      <Field label="Google Maps link" hint="Optional. Paste a share link from Google Maps." error={errors.mapsUrl?.message}>
        {(p) => <Input {...p} {...register("mapsUrl")} type="url" inputMode="url" autoComplete="off" placeholder="https://maps.app.goo.gl/…" />}
      </Field>
      <Field label="Notes" error={errors.notes?.message} hint="Photos are added from the idea itself.">
        {(p) => <Textarea {...p} {...register("notes")} rows={2} placeholder="Anything the group should know" />}
      </Field>
      <Controller
        control={control}
        name="dealBreaker"
        render={({ field }) => (
          <ToggleRow
            tone="must"
            icon={<Flag className="size-4" strokeWidth={2.6} aria-hidden />}
            label="Deal-breaker / must-do"
            hint="Flagged on the card and in voting"
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {(!idea || idea.decision !== "dropped") && (
        <Controller
          control={control}
          name="decision"
          render={({ field }) => (
            <ChipGroup
              label="Status"
              options={["draft", "confirmed"]}
              value={field.value}
              onChange={(v) => field.onChange(v || field.value)}
            />
          )}
        />
      )}
    </form>
  );
}

type SectionProps = {
  control: Control<IdeaFormValues>;
  register: UseFormRegister<IdeaFormValues>;
  errors: ReturnType<typeof useForm<IdeaFormValues>>["formState"]["errors"];
};

/** A chip group wired to one form field. */
function Chips({
  control,
  name,
  label,
  options,
  multi,
  display,
}: {
  control: Control<IdeaFormValues>;
  name: keyof IdeaFormValues;
  label: string;
  options: readonly string[];
  multi?: boolean;
  display?: (v: string) => string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChipGroup label={label} options={options} value={field.value as string | string[]} onChange={field.onChange} multi={multi} display={display} />
      )}
    />
  );
}

function Switch({ control, name, label, hint }: { control: Control<IdeaFormValues>; name: keyof IdeaFormValues; label: string; hint?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <ToggleRow label={label} hint={hint} checked={field.value === true} onChange={field.onChange} />}
    />
  );
}

function StaySection({ control, register, errors, currency }: SectionProps & { currency: string }) {
  const [cost, unit, nightsStr, cin, cout, cancellation, curr] = useWatch({
    control,
    name: ["cost", "unit", "nights", "checkInDay", "checkOutDay", "cancellation", "currency"],
  });
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v.replace(/,/g, ""))) ? undefined : Number(v.replace(/,/g, "")));
  const fromDays = nightsBetween(num(cin), num(cout));
  const nights = num(nightsStr) ?? fromDays ?? undefined;
  const price = num(cost);
  const total = price === undefined ? undefined : unit === "night" ? (nights ? price * nights : undefined) : price;
  return (
    <>
      <Chips control={control} name="stayType" label="Stay type" options={STAY_TYPES} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in day" error={errors.checkInDay?.message} hint="A trip day number. The date is worked out from the trip start.">
          {(p) => <Input {...p} {...register("checkInDay")} inputMode="numeric" placeholder="2" />}
        </Field>
        <Field label="Check-out day" error={errors.checkOutDay?.message}>
          {(p) => <Input {...p} {...register("checkOutDay")} inputMode="numeric" placeholder="5" />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nights" error={errors.nights?.message} hint={fromDays !== null && !nightsStr ? `${fromDays} from the days` : undefined}>
          {(p) => <Input {...p} {...register("nights")} inputMode="decimal" placeholder={fromDays !== null ? String(fromDays) : ""} />}
        </Field>
        <Field label="Check-in time" error={errors.checkInTime?.message} hint="Optional">
          {(p) => <Input {...p} {...register("checkInTime")} type="time" />}
        </Field>
      </div>
      <p className="flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-3 text-sm" aria-live="polite">
        <span className="text-fg-muted">
          {nights && price !== undefined && unit === "night" ? `${nights} ${nights === 1 ? "night" : "nights"} × ${formatMoney(price, curr || currency)}` : "Total"}
        </span>
        <b className="font-mono text-base">{total !== undefined ? formatMoney(total, curr || currency) : "–"}</b>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Beds / rooms" error={errors.rooms?.message}>
          {(p) => <Input {...p} {...register("rooms")} placeholder="1 room, 2 beds" />}
        </Field>
        <Field label="Max guests" error={errors.maxGuests?.message}>
          {(p) => <Input {...p} {...register("maxGuests")} inputMode="numeric" />}
        </Field>
      </div>
      <Chips control={control} name="cancellation" label="Cancellation" options={CANCELLATION} />
      {cancellation === "free" && (
        <Field label="Free until day" error={errors.freeUntilDay?.message} hint="Optional. Adds a reminder on Home before it ends.">
          {(p) => <Input {...p} {...register("freeUntilDay")} inputMode="numeric" placeholder="1" />}
        </Field>
      )}
      <Switch control={control} name="breakfast" label="Breakfast included" />
      <Chips control={control} name="amenities" label="Amenities" options={AMENITIES} multi display={(a) => a} />
      <Field label="Distance to a key spot" error={errors.nearby?.message}>
        {(p) => <Input {...p} {...register("nearby")} placeholder="5 min walk to the station" />}
      </Field>
      <Chips control={control} name="booking" label="Booking" options={BOOKING} />
    </>
  );
}

function FoodSection({ control, register, errors }: SectionProps) {
  const reservationNeeded = useWatch({ control, name: "reservationNeeded" });
  return (
    <>
      <Chips control={control} name="cuisines" label="Cuisine" options={CUISINES} multi display={(c) => c} />
      <Field label="Must-try dish" error={errors.mustTry?.message}>
        {(p) => <Input {...p} {...register("mustTry")} placeholder="Bún chả with nem cua bể" />}
      </Field>
      <Chips control={control} name="mealSlots" label="Meal" options={MEAL_SLOTS} multi />
      <Chips control={control} name="priceBand" label="Price range (per person)" options={PRICE_BANDS} />
      <Chips control={control} name="dietary" label="Dietary" options={DIETARY} multi />
      <Field label="Opening hours / best time to go" error={errors.hours?.message}>
        {(p) => <Input {...p} {...register("hours")} placeholder="11:00 to 14:00, best before 12" />}
      </Field>
      <Switch control={control} name="reservationNeeded" label="Reservation needed" />
      {reservationNeeded && <Switch control={control} name="reservationBooked" label="Reservation made" />}
      <Switch control={control} name="queueProne" label="Queue-prone" hint="Worth going early" />
      <Chips control={control} name="payment" label="Payment" options={PAYMENT} />
    </>
  );
}

function SightSection({ control, register, errors }: SectionProps) {
  const ticketsNeeded = useWatch({ control, name: "ticketsNeeded" });
  return (
    <>
      <Chips control={control} name="sightType" label="Type" options={SIGHT_TYPES} />
      <Switch control={control} name="ticketsNeeded" label="Tickets needed in advance" />
      {ticketsNeeded && <Switch control={control} name="ticketsBooked" label="Tickets booked" />}
      <Chips control={control} name="duration" label="Suggested duration" options={DURATIONS} />
      <Field label="Or a custom length (minutes)" error={errors.durationMin?.message}>
        {(p) => <Input {...p} {...register("durationMin")} inputMode="numeric" placeholder="150" />}
      </Field>
      <Chips control={control} name="bestTimes" label="Best time of day" options={BEST_TIMES} multi />
      <Field label="Opening hours / closed days" error={errors.hours?.message}>
        {(p) => <Input {...p} {...register("hours")} placeholder="07:00 to 17:00, daily" />}
      </Field>
      <Chips control={control} name="effort" label="Effort" options={EFFORT} />
      <Switch control={control} name="weatherSensitive" label="Weather-sensitive" />
      <Chips control={control} name="setting" label="Setting" options={SETTING} />
      <Field label="Dress code or things to bring" error={errors.bring?.message}>
        {(p) => <Input {...p} {...register("bring")} placeholder="Hat, sunscreen, small cash" />}
      </Field>
    </>
  );
}
