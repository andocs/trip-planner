import "server-only";

import { datesIn, parseForecast, parseTypical, sameDayLastYear, validCoords, windows, type WeatherDay } from "./weather";

/**
 * The calls to Open-Meteo (free, no key). Server only: viewers' browsers never contact the weather service, so it sees this
 * server and nothing about the people using the app. What leaves is a place rounded to about 1 km and a date range: no trip name,
 * no names, no account, no cookies. Errors from the service are never passed on (only "unavailable").
 */
export class WeatherError extends Error {}

export type WeatherDeps = { fetch: typeof fetch; today: string };
export type WeatherQuery = { lat: number; lng: number; from: string; to: string };

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const TIMEOUT_MS = 5000;

function url(base: string, q: WeatherQuery, from: string, to: string, daily: string): string {
  const p = new URLSearchParams({
    latitude: String(q.lat),
    longitude: String(q.lng),
    daily,
    timezone: "auto",
    start_date: from,
    end_date: to,
  });
  return `${base}?${p}`;
}

async function getJson(deps: WeatherDeps, endpoint: string): Promise<unknown> {
  const res = await deps.fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new WeatherError("service refused");
  return res.json();
}

/**
 * Forecast for the days within reach, last year's weather for the rest. If one of the two calls fails the other still answers
 * (last year's weather does not depend on the forecast service being up); if both fail, the error is a plain WeatherError.
 */
export async function weatherFor(q: WeatherQuery, deps: WeatherDeps): Promise<WeatherDay[]> {
  if (!validCoords(q.lat, q.lng)) throw new WeatherError("bad place");
  const { forecast, typical } = windows(q.from, q.to, deps.today);
  const jobs: Promise<WeatherDay[]>[] = [];
  if (forecast)
    jobs.push(
      getJson(deps, url(FORECAST, q, forecast.from, forecast.to, "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max")).then(parseForecast),
    );
  if (typical)
    jobs.push(
      getJson(deps, url(ARCHIVE, q, sameDayLastYear(typical.from), sameDayLastYear(typical.to), "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum")).then((j) =>
        parseTypical(j, datesIn(typical)),
      ),
    );
  const settled = await Promise.allSettled(jobs);
  if (settled.length > 0 && settled.every((s) => s.status === "rejected")) throw new WeatherError("unavailable");
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : [])).sort((a, b) => a.date.localeCompare(b.date));
}
