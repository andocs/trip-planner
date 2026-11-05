import { z } from "zod";

/**
 * Form fields stay strings (that's what inputs give us); these schemas turn them into
 * the values the database expects. Use `z.input<>` for form values, `z.output<>` for saving.
 */

export const text = (max = 200) => z.string().trim().max(max, `Keep it under ${max} characters`);
export const requiredText = (label: string, max = 200) => text(max).min(1, `${label} is required`);
export const optionalText = (max = 200) => text(max).transform((v) => (v === "" ? null : v));

const NUM = /^-?\d+(\.\d+)?$/;
const clean = (v: string) => v.replace(/,/g, "").trim();

export const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z
    .string()
    .transform(clean)
    .refine((v) => v === "" || NUM.test(v), "Enter a number")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || opts.min === undefined || v >= opts.min, `Must be at least ${opts.min}`)
    .refine((v) => v === null || opts.max === undefined || v <= opts.max, `Must be at most ${opts.max}`)
    .refine((v) => v === null || !opts.int || Number.isInteger(v), "Use a whole number");

export const requiredNumber = (label: string, opts: { min?: number; max?: number; int?: boolean; gt?: number } = {}) =>
  z
    .string()
    .transform(clean)
    .refine((v) => v !== "", `${label} is required`)
    .refine((v) => v === "" || NUM.test(v), "Enter a number")
    .transform(Number)
    .refine((v) => opts.gt === undefined || v > opts.gt, `Must be more than ${opts.gt}`)
    .refine((v) => opts.min === undefined || v >= opts.min, `Must be at least ${opts.min}`)
    .refine((v) => opts.max === undefined || v <= opts.max, `Must be at most ${opts.max}`)
    .refine((v) => !opts.int || Number.isInteger(v), "Use a whole number");

export const optionalDate = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date")
  .transform((v) => (v === "" ? null : v));

export const currencyCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{3}$/.test(v), "Use a 3-letter code like PHP");

/** GeoChart region: "world", a 3-digit continent/sub-continent code, or an ISO country (optionally with subdivision). */
export const mapRegion = z
  .string()
  .trim()
  .transform((v) => (v === "" ? "world" : /^\d{3}$/.test(v) || v === "world" ? v : v.toUpperCase()))
  .refine(
    (v) => v === "world" || /^\d{3}$/.test(v) || /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(v),
    "Use world, a country code like VN, or a region code like 035",
  );

/** Turns a nullable DB value into a form string. */
export const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export const COMMON_CURRENCIES = [
  "PHP",
  "USD",
  "EUR",
  "JPY",
  "KRW",
  "VND",
  "THB",
  "SGD",
  "MYR",
  "IDR",
  "HKD",
  "TWD",
  "CNY",
  "AUD",
  "NZD",
  "GBP",
  "CAD",
  "CHF",
  "AED",
  "INR",
];

export const MAP_REGIONS = [
  { value: "world", label: "Whole world" },
  { value: "142", label: "Asia" },
  { value: "035", label: "South-East Asia" },
  { value: "030", label: "East Asia" },
  { value: "150", label: "Europe" },
  { value: "019", label: "Americas" },
  { value: "002", label: "Africa" },
  { value: "009", label: "Oceania" },
];

/** Optional http(s) URL. Anything else (javascript:, data:) is rejected so it can never be rendered as a link. */
export const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Use a full link starting with https://")
  .transform((v) => (v === "" ? null : v));

/** Local wall-clock date-time from <input type="datetime-local">. */
export const optionalDateTime = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v), "Pick a date and time")
  .transform((v) => (v === "" ? null : v.slice(0, 16)));

export const statusField = z.enum(["Idea", "Maybe", "Planned", "Priced", "Booked", "Done", "Cancelled"]);
