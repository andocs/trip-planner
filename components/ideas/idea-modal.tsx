"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BedDouble, CalendarDays, ChevronDown, ClipboardPaste, Coins, Flag, Landmark, Link2, MapPin, NotebookText, Plus, Utensils } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control, type Resolver, type UseFormRegister } from "react-hook-form";
import { toast } from "sonner";
import { useTrip } from "@/components/trip-gate";
import { FormFooter } from "@/components/ui/form-footer";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormGroup } from "@/components/ui/form-group";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { IdeaPhotos } from "@/components/photos/idea-photos";
import { ideaKey, KIND_LABEL, TABLE_OF_KIND, type Idea, type IdeaKind } from "@/lib/drafts";
import { useImages, usePhotoUrls, useRemovePhoto } from "@/lib/queries/images";
import { STAY_STATUSES, withDayNumbers } from "@/lib/stay-sync";
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
const KIND_GROUP_ICON = { stay: BedDouble, food: Utensils, sight: Landmark } as const;
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
  /**
   * The Stays page: the same form, for a stay. The category and "paste a list" pills, the draft/confirmed status and the
   * must-do flag go away, and a Booking group (status, real dates, confirmation number) comes in. The page saves.
   */
  stay?: {
    defaults: IdeaFormValues;
    editing: boolean;
    /** `draftId` is the id the photos added in the form belong to: a new stay's idea takes it. */
    save: (payload: IdeaPayload, out: Record<string, unknown>, draftId: string) => void;
    onDelete?: () => void;
  };
};

/**
 * The one add/edit form for every idea: a shared shell and category-specific fields for stays, food places and
 * sights. Everything is short inputs, chips and switches. It never calls Google: a name or area that came from a
 * saved Google result is only prefilled. Used from the Places board (add and edit) and from Discover.
 */
export function IdeaModal({ kind: startKind, idea, prefill, cities, onClose, onCreate, pending, submitLabel, note, startMode, stay }: IdeaModalProps) {
  const [kind, setKindRaw] = useState<IdeaKind>(stay ? "stay" : (idea?.kind ?? startKind));
  // Photos added before the place is saved need an id to belong to: made up front, used when it is saved.
  const [draftId, setDraftId] = useState(() => newId());
  const { byIdea: imagesBy } = useImages();
  const discard = useRemovePhoto();
  const stagedOf = (k: IdeaKind) => imagesBy.get(ideaKey(TABLE_OF_KIND[k], draftId)) ?? [];
  const discardStaged = (k: IdeaKind) => {
    for (const r of stagedOf(k)) discard.mutate(r);
  };
  /** Leaving without saving: the photos that were added meanwhile have no place to belong to, so they go too. */
  const cancel = () => {
    if (!idea) discardStaged(kind);
    onClose();
  };
  const setKind = (k: IdeaKind) => {
    // A photo belongs to one category's table, so a category change starts the photos again.
    if (k !== kind && stagedOf(kind).length > 0) {
      discardStaged(kind);
      toast("Photos were removed because the category changed.");
    }
    setKindRaw(k);
  };
  // Switching category (add mode) keeps what was typed in the shared fields.
  const [carry, setCarry] = useState<Partial<IdeaFormValues>>({ name: prefill?.name ?? "", city: prefill?.city ?? "" });
  const editing = stay ? stay.editing : !!idea;
  // Keep adding (on by default for places): after a save the name clears and the area and category stay.
  // A save from Discover is for one Google place, so it always closes.
  const canPaste = !editing && !onCreate && !stay;
  const [mode, setMode] = useState<"one" | "paste">(canPaste && startMode === "paste" ? "paste" : "one");
  const pasting = canPaste && mode === "paste";
  const [paste, setPaste] = useState<PasteSummary>({ count: 0, pending: false });
  const canKeep = canPaste && !pasting;
  const [keep, setKeep] = useState(true);
  const [round, setRound] = useState(0);
  const finish = (city: string) => {
    setDraftId(newId()); // the photos added so far now belong to the saved place
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
    if (stay?.onDelete) {
      stay.onDelete();
      onClose();
      return;
    }
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
      onOpenChange={(o) => !o && cancel()}
      title={stay ? (editing ? "Edit stay" : "Add stay") : editing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : "Add place"}
      description={idea?.name}
      badge={
        idea && !stay ? (
          <span
            className={cn(
              "inline-flex min-h-6 items-center rounded-full px-2 text-xs font-extrabold",
              idea.decision === "confirmed" ? "bg-teal-tint text-teal" : idea.decision === "dropped" ? "bg-danger-tint text-danger" : "bg-warn-tint text-warn-text",
            )}
          >
            {idea.decision === "draft" ? "Draft" : idea.decision === "confirmed" ? "Confirmed" : "Dropped"}
          </span>
        ) : undefined
      }
      footer={
        <FormFooter
          mode={editing ? "edit" : "add"}
          formId={FORM_ID}
          submitLabel={pasting ? (paste.count > 1 ? `Add ${paste.count} places` : "Add") : submitLabel}
          pending={pasting ? pending || paste.pending || paste.count === 0 : pending}
          onCancel={cancel}
          onDelete={editing ? onDelete : undefined}
          keepAdding={canKeep ? { value: keep, onChange: setKeep } : undefined}
        />
      }
    >
      {!editing && !stay && (
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
          draftId={draftId}
          stay={stay}
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
  draftId,
  stay,
}: {
  kind: IdeaKind;
  idea?: Idea;
  draftId: string;
  stay?: IdeaModalProps["stay"];
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

  const defaults: IdeaFormValues = stay ? stay.defaults : idea ? formFromIdea(idea, home) : { ...blankForm(kind, home), ...carry };
  const urlOf = usePhotoUrls();
  const { byIdea: imagesBy } = useImages();
  // Photos are shared by every place that can be saved from this form (not a Google save, which makes its own row).
  const photoTable = TABLE_OF_KIND[kind];
  const photoOwnerId = idea?.id ?? draftId;
  const photoKey = ideaKey(photoTable, photoOwnerId);
  const showPhotos = !onCreate;
  const { register, handleSubmit, control, formState } = useForm<IdeaFormValues>({
    resolver: zodResolver(FORM_SCHEMA[kind]) as unknown as Resolver<IdeaFormValues>,
    defaultValues: defaults,
  });
  const errors = formState.errors;
  // Category details are folded away when adding; editing opens them.
  const [detailsOpen, setDetailsOpen] = useState(!!idea || !!stay);
  const [name, city] = useWatch({ control, name: ["name", "city"] });

  // Remember the shared fields so a category switch (add mode) does not lose them.
  const remember = () => onCarry({ name, city });

  const onSubmit = handleSubmit((out) => {
    if (stay) {
      // The Stays page saves: the real dates give the day numbers the idea payload needs.
      const prepared = withDayNumbers(out as never, trip.start_date);
      const payload = toPayload("stay", prepared as never);
      stay.save(payload, prepared as unknown as Record<string, unknown>, draftId);
      onDone(out.city);
      return;
    }
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
    (insert[payload.table].mutate as (v: unknown) => void)([{ id: draftId, ...payload.columns, ...payload.insertOnly }]);
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
      <FormGroup icon={MapPin} title="The place">
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
      </FormGroup>

      <FormGroup icon={Coins} title="Price">
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
      </FormGroup>

      <FormGroup icon={KIND_GROUP_ICON[kind]} title={FOLD[kind][0]}>
        <div>
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-label={FOLD[kind][0]}
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 text-left"
          >
            <span className="text-sm font-medium text-fg-muted">{detailsOpen ? "Hide" : FOLD[kind][1]}</span>
            <ChevronDown className={cn("size-5 shrink-0 transition-transform motion-reduce:transition-none", detailsOpen && "rotate-180")} aria-hidden />
          </button>
          {detailsOpen && (
            <div className="mt-4 space-y-4">
              {kind === "stay" && <StaySection control={control} register={register} errors={errors} currency={home} record={!!stay} />}
              {kind === "food" && <FoodSection control={control} register={register} errors={errors} />}
              {kind === "sight" && <SightSection control={control} register={register} errors={errors} />}
            </div>
          )}
        </div>
      </FormGroup>

      {stay && (
        <FormGroup icon={CalendarDays} title="Dates and booking">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in" error={errors.checkIn?.message}>
              {(p) => <Input {...p} {...register("checkIn")} type="date" />}
            </Field>
            <Field label="Check-out" error={errors.checkOut?.message}>
              {(p) => <Input {...p} {...register("checkOut")} type="date" />}
            </Field>
          </div>
          <Controller
            control={control}
            name="stayStatus"
            render={({ field }) => <ChipGroup label="Status" options={STAY_STATUSES} value={field.value} onChange={(v) => field.onChange((v as string) || field.value)} />}
          />
          <Field label="Confirmation no." error={errors.confirmation?.message} hint="Only you can see this.">
            {(p) => <Input {...p} {...register("confirmation")} autoComplete="off" className="font-mono" />}
          </Field>
        </FormGroup>
      )}

      <FormGroup icon={Link2} title={showPhotos ? "Links and photos" : "Links"}>
        <Field label="Website" hint="Optional" error={errors.website?.message}>
          {(p) => <Input {...p} {...register("website")} type="url" inputMode="url" autoComplete="off" placeholder="https://" />}
        </Field>
        <Field label="Google Maps link" hint="Optional. Paste a share link from Google Maps." error={errors.mapsUrl?.message}>
          {(p) => <Input {...p} {...register("mapsUrl")} type="url" inputMode="url" autoComplete="off" placeholder="https://maps.app.goo.gl/…" />}
        </Field>
        {showPhotos && (
          <IdeaPhotos
            idea={{ table: photoTable, id: photoOwnerId, key: photoKey, name: name?.trim() || "this place" }}
            images={imagesBy.get(photoKey) ?? []}
            urlOf={urlOf}
            canEdit
          />
        )}
      </FormGroup>

      <FormGroup icon={NotebookText} title={stay ? "Notes" : "Notes and status"}>
        <Field label="Notes" error={errors.notes?.message}>
          {(p) => <Textarea {...p} {...register("notes")} rows={2} placeholder="Anything the group should know" />}
        </Field>
        {!stay && (
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
        )}
        {!stay && (!idea || idea.decision !== "dropped") && (
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
      </FormGroup>
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

export function StaySection({ control, register, errors, currency, record }: SectionProps & { currency: string; record?: boolean }) {
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
      {!record && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in day" error={errors.checkInDay?.message} hint="A trip day number. The date is worked out from the trip start.">
            {(p) => <Input {...p} {...register("checkInDay")} inputMode="numeric" placeholder="2" />}
          </Field>
          <Field label="Check-out day" error={errors.checkOutDay?.message}>
            {(p) => <Input {...p} {...register("checkOutDay")} inputMode="numeric" placeholder="5" />}
          </Field>
        </div>
      )}
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
      {cancellation === "free" &&
        (record ? (
          <Field label="Free until" error={errors.freeUntil?.message} hint="Optional. Adds a reminder on Home before it ends.">
            {(p) => <Input {...p} {...register("freeUntil")} type="date" />}
          </Field>
        ) : (
          <Field label="Free until day" error={errors.freeUntilDay?.message} hint="Optional. Adds a reminder on Home before it ends.">
            {(p) => <Input {...p} {...register("freeUntilDay")} inputMode="numeric" placeholder="1" />}
          </Field>
        ))}
      <Switch control={control} name="breakfast" label="Breakfast included" />
      <Chips control={control} name="amenities" label="Amenities" options={AMENITIES} multi display={(a) => a} />
      <Field label="Distance to a key spot" error={errors.nearby?.message}>
        {(p) => <Input {...p} {...register("nearby")} placeholder="5 min walk to the station" />}
      </Field>
      {!record && <Chips control={control} name="booking" label="Booking" options={BOOKING} />}
    </>
  );
}

export function FoodSection({ control, register, errors }: SectionProps) {
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

export function SightSection({ control, register, errors }: SectionProps) {
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
