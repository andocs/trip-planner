import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-react";
import { degrees, describeCode, describeDay, type WeatherDay, type WeatherIcon } from "@/lib/weather";

const ICONS: Record<WeatherIcon, typeof Sun> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

/**
 * One day's weather under its divider: an icon, the high and low, and either the chance of rain (a forecast) or "usually"
 * (what that date was like last year). A screen reader gets the whole sentence; the weather is a hint, never a promise.
 */
export function DayWeather({ weather }: { weather: WeatherDay }) {
  const Icon = ICONS[describeCode(weather.code).icon];
  const rain = weather.kind === "forecast" && weather.rainChance !== null && weather.rainChance >= 30 ? `${Math.round(weather.rainChance)}% rain` : null;
  return (
    <span
      role="img"
      aria-label={`Weather: ${describeDay(weather)}`}
      className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-xs font-bold text-fg-muted"
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
      <span aria-hidden className="font-mono font-medium text-fg">
        {degrees(weather.high)} / {degrees(weather.low)}
      </span>
      {weather.kind === "typical" && <span aria-hidden className="font-medium">usually</span>}
      {rain && <span aria-hidden className="font-medium">{rain}</span>}
    </span>
  );
}
