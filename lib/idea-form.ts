import { z } from "zod";
import type { Idea, IdeaKind } from "./drafts";
import {
  AMENITIES,
  BEST_TIMES,
  BOOKING,
  CANCELLATION,
  compact,
  CUISINES,
  DEFAULT_UNIT,
  DETAILS_SCHEMA,
  DIETARY,
  DURATIONS,
  EFFORT,
  MEAL_SLOTS,
  nightsBetween,
  parseDetails,
  PAYMENT,
  PRICE_BANDS,
  SETTING,
  SIGHT_TYPES,
  STAY_TYPES,
  UNITS,
  type Unit,
} from "./idea-details";
import { currencyCode, optionalDate, optionalMapsUrl, optionalNumber, optionalText, optionalUrl, requiredText, str } from "./schemas";

/**
 * The shared add/edit modal's form: one set of string-friendly values, one zod schema per category, and the two
 * mappings (form -> table columns + details, idea -> form). Pure so the rules are easy to test.
 */

const oneOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).or(z.literal(""));
const picks = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values));
const time = z.string().refine((v) => v === "" || /^\d{2}:\d{2}$/.test(v), "Use a time like 14:00");
const dayNo = optionalNumber({ min: -30, max: 365, int: true });

const shared = {
  name: requiredText("Name", 120),
  city: optionalText(80),
  notes: optionalText(500),
  website: optionalUrl,
  mapsUrl: optionalMapsUrl,
  cost: optionalNumber({ min: 0 }),
  unit: z.enum(UNITS),
  currency: currencyCode,
  dealBreaker: z.boolean(),
  decision: z.enum(["draft", "confirmed"]),
};

export const stayForm = z
  .object({
    ...shared,
    stayType: oneOf(STAY_TYPES),
    nights: optionalNumber({ min: 0, max: 365 }),
    checkInDay: dayNo,
    checkOutDay: dayNo,
    checkInTime: time,
    rooms: optionalText(60),
    maxGuests: optionalNumber({ min: 1, max: 50, int: true }),
    cancellation: oneOf(CANCELLATION),
    freeUntilDay: dayNo,
    breakfast: z.boolean(),
    // Only used when a stay is saved from the Stays page (real dates and the booking), never by the board.
    checkIn: optionalDate,
    checkOut: optionalDate,
    freeUntil: optionalDate,
    confirmation: optionalText(60),
    stayStatus: z.string(),
    amenities: picks(AMENITIES),
    nearby: optionalText(120),
    booking: oneOf(BOOKING),
  })
  .refine((v) => v.checkInDay === null || v.checkOutDay === null || v.checkOutDay >= v.checkInDay, {
    path: ["checkOutDay"],
    message: "Check-out can't be before check-in",
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut >= v.checkIn, {
    path: ["checkOut"],
    message: "Check-out must be on or after check-in",
  });

export const foodForm = z.object({
  ...shared,
  cuisines: picks(CUISINES),
  mustTry: optionalText(120),
  mealSlots: picks(MEAL_SLOTS),
  priceBand: oneOf(PRICE_BANDS),
  dietary: picks(DIETARY),
  hours: optionalText(120),
  reservationNeeded: z.boolean(),
  reservationBooked: z.boolean(),
  queueProne: z.boolean(),
  payment: oneOf(PAYMENT),
});

export const sightForm = z.object({
  ...shared,
  sightType: oneOf(SIGHT_TYPES),
  ticketsNeeded: z.boolean(),
  ticketsBooked: z.boolean(),
  duration: oneOf(DURATIONS),
  durationMin: optionalNumber({ min: 1, max: 24 * 60, int: true }),
  bestTimes: picks(BEST_TIMES),
  hours: optionalText(120),
  effort: oneOf(EFFORT),
  weatherSensitive: z.boolean(),
  setting: oneOf(SETTING),
  bring: optionalText(120),
});

export const FORM_SCHEMA = { stay: stayForm, food: foodForm, sight: sightForm } as const;

/** Every field of every category, as the inputs hold them (numbers as text). Unused categories stay at their blanks. */
export type IdeaFormValues = {
  name: string;
  city: string;
  notes: string;
  website: string;
  mapsUrl: string;
  cost: string;
  unit: Unit;
  currency: string;
  dealBreaker: boolean;
  decision: "draft" | "confirmed";
  // stay
  stayType: string;
  nights: string;
  checkInDay: string;
  checkOutDay: string;
  checkInTime: string;
  rooms: string;
  maxGuests: string;
  cancellation: string;
  freeUntilDay: string;
  breakfast: boolean;
  checkIn: string;
  checkOut: string;
  freeUntil: string;
  confirmation: string;
  stayStatus: string;
  amenities: string[];
  nearby: string;
  booking: string;
  // food
  cuisines: string[];
  mustTry: string;
  mealSlots: string[];
  priceBand: string;
  dietary: string[];
  hours: string;
  reservationNeeded: boolean;
  reservationBooked: boolean;
  queueProne: boolean;
  payment: string;
  // sight
  sightType: string;
  ticketsNeeded: boolean;
  ticketsBooked: boolean;
  duration: string;
  durationMin: string;
  bestTimes: string[];
  effort: string;
  weatherSensitive: boolean;
  setting: string;
  bring: string;
};

export function blankForm(kind: IdeaKind, currency: string): IdeaFormValues {
  return {
    name: "",
    city: "",
    notes: "",
    website: "",
    mapsUrl: "",
    cost: "",
    unit: DEFAULT_UNIT[kind],
    currency,
    dealBreaker: false,
    decision: "draft",
    stayType: "",
    nights: "",
    checkInDay: "",
    checkOutDay: "",
    checkInTime: "",
    rooms: "",
    maxGuests: "",
    cancellation: "",
    freeUntilDay: "",
    breakfast: false,
    checkIn: "",
    checkOut: "",
    freeUntil: "",
    confirmation: "",
    stayStatus: "Planned",
    amenities: [],
    nearby: "",
    booking: "",
    cuisines: [],
    mustTry: "",
    mealSlots: [],
    priceBand: "",
    dietary: [],
    hours: "",
    reservationNeeded: false,
    reservationBooked: false,
    queueProne: false,
    payment: "",
    sightType: "",
    ticketsNeeded: false,
    ticketsBooked: false,
    duration: "",
    durationMin: "",
    bestTimes: [],
    effort: "",
    weatherSensitive: false,
    setting: "",
    bring: "",
  };
}

/** The form for an existing idea: its own columns first, then whatever its details hold. */
export function formFromIdea(idea: Idea, currency: string): IdeaFormValues {
  const d = parseDetails(idea.kind, idea.details);
  const f = blankForm(idea.kind, d.currency ?? currency);
  f.name = idea.name;
  f.city = idea.city ?? "";
  f.notes = idea.note ?? "";
  f.website = d.website ?? "";
  f.mapsUrl = d.mapsUrl ?? "";
  f.cost = str(d.pricePerNight ?? idea.price);
  f.unit = d.unit ?? idea.priceUnit ?? DEFAULT_UNIT[idea.kind];
  f.dealBreaker = idea.dealBreaker;
  f.decision = idea.decision === "confirmed" ? "confirmed" : "draft";
  if (idea.kind === "stay") {
    f.stayType = d.stayType ?? "";
    f.nights = str(idea.nights);
    f.checkInDay = str(d.checkInDay);
    f.checkOutDay = str(d.checkOutDay);
    f.checkInTime = d.checkInTime ?? "";
    f.rooms = d.rooms ?? "";
    f.maxGuests = str(d.maxGuests);
    f.cancellation = d.cancellation ?? "";
    f.freeUntilDay = str(d.freeUntilDay);
    f.freeUntil = d.freeUntil ?? "";
    f.breakfast = d.breakfast === true;
    f.amenities = d.amenities ?? [];
    f.nearby = d.nearby ?? "";
    f.booking = d.booking ?? "";
  } else if (idea.kind === "food") {
    f.cuisines = d.cuisines ?? [];
    f.mustTry = d.mustTry ?? "";
    f.mealSlots = d.mealSlots ?? [];
    f.priceBand = d.priceBand ?? "";
    f.dietary = d.dietary ?? [];
    f.hours = d.hours ?? "";
    f.reservationNeeded = d.reservationNeeded === true;
    f.reservationBooked = d.reservationBooked === true;
    f.queueProne = d.queueProne === true;
    f.payment = d.payment ?? "";
  } else {
    f.sightType = d.sightType ?? "";
    f.ticketsNeeded = d.ticketsNeeded === true;
    f.ticketsBooked = d.ticketsBooked === true;
    f.duration = d.duration ?? "";
    f.durationMin = str(d.durationMin);
    f.bestTimes = d.bestTimes ?? [];
    f.hours = d.hours ?? "";
    f.effort = d.effort ?? "";
    f.weatherSensitive = d.weatherSensitive === true;
    f.setting = d.setting ?? "";
    f.bring = d.bring ?? "";
  }
  return f;
}

export const TABLE_FOR = { stay: "hotel_ideas", food: "food_places", sight: "attractions" } as const;
const money = (n: number) => Math.round(n * 100) / 100;
const yes = (b: boolean) => (b ? true : undefined);

/** What to write for a validated form: the table's own columns, the details object, and extras for a brand-new row. */
export type IdeaPayload = {
  table: (typeof TABLE_FOR)[IdeaKind];
  /** Columns for both insert and update. */
  columns: Record<string, unknown>;
  /** Only on insert (the legacy status the older lists expect). */
  insertOnly: Record<string, unknown>;
  name: string;
  city: string | null;
};

type Out<K extends IdeaKind> = z.output<(typeof FORM_SCHEMA)[K]>;

export function toPayload(kind: "stay", v: Out<"stay">): IdeaPayload;
export function toPayload(kind: "food", v: Out<"food">): IdeaPayload;
export function toPayload(kind: "sight", v: Out<"sight">): IdeaPayload;
export function toPayload(kind: IdeaKind, raw: Out<"stay"> | Out<"food"> | Out<"sight">): IdeaPayload {
  const base = { city: raw.city, deal_breaker: raw.dealBreaker, decision: raw.decision };
  const sharedDetails = { unit: raw.unit, currency: raw.currency, website: raw.website ?? undefined, mapsUrl: raw.mapsUrl ?? undefined };

  if (kind === "stay") {
    const v = raw as Out<"stay">;
    const nights = v.nights ?? nightsBetween(v.checkInDay ?? undefined, v.checkOutDay ?? undefined);
    const perNight = v.unit === "night" ? v.cost : null;
    const total = v.cost === null ? null : v.unit === "night" ? (nights ? money(v.cost * nights) : null) : money(v.cost);
    const details = DETAILS_SCHEMA.stay.parse(
      compact({
        ...sharedDetails,
        stayType: v.stayType || undefined,
        pricePerNight: perNight ?? undefined,
        checkInDay: v.checkInDay,
        checkOutDay: v.checkOutDay,
        checkInTime: v.checkInTime || undefined,
        rooms: v.rooms,
        maxGuests: v.maxGuests,
        cancellation: v.cancellation || undefined,
        freeUntilDay: v.cancellation === "free" ? v.freeUntilDay : undefined,
        freeUntil: v.cancellation === "free" ? (v.freeUntil ?? undefined) : undefined,
        breakfast: yes(v.breakfast),
        amenities: v.amenities,
        nearby: v.nearby,
        booking: v.booking || undefined,
      }),
    );
    return { table: "hotel_ideas", columns: { ...base, hotel: v.name, room: v.notes, nights, total, details }, insertOnly: {}, name: v.name, city: v.city };
  }

  if (kind === "food") {
    const v = raw as Out<"food">;
    const details = DETAILS_SCHEMA.food.parse(
      compact({
        ...sharedDetails,
        cuisines: v.cuisines,
        mustTry: v.mustTry,
        mealSlots: v.mealSlots,
        priceBand: v.priceBand || undefined,
        dietary: v.dietary,
        hours: v.hours,
        reservationNeeded: yes(v.reservationNeeded),
        reservationBooked: v.reservationNeeded ? yes(v.reservationBooked) : undefined,
        queueProne: yes(v.queueProne),
        payment: v.payment || undefined,
      }),
    );
    return { table: "food_places", columns: { ...base, name: v.name, note: v.notes, price: v.cost, details }, insertOnly: { status: "Idea" }, name: v.name, city: v.city };
  }

  const v = raw as Out<"sight">;
  const details = DETAILS_SCHEMA.sight.parse(
    compact({
      ...sharedDetails,
      sightType: v.sightType || undefined,
      ticketsNeeded: yes(v.ticketsNeeded),
      ticketsBooked: v.ticketsNeeded ? yes(v.ticketsBooked) : undefined,
      duration: v.durationMin ? undefined : v.duration || undefined,
      durationMin: v.durationMin,
      bestTimes: v.bestTimes,
      hours: v.hours,
      effort: v.effort || undefined,
      weatherSensitive: yes(v.weatherSensitive),
      setting: v.setting || undefined,
      bring: v.bring,
    }),
  );
  return { table: "attractions", columns: { ...base, name: v.name, note: v.notes, price: v.cost, details }, insertOnly: { status: "Idea" }, name: v.name, city: v.city };
}
