"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui/field";
import { localISODate } from "@/lib/calc";
import { gmtLabel, ZONES, zoneCity } from "@/lib/timezones";
import { useClientValue } from "@/lib/use-client-value";

/**
 * A time zone picker: the home zone first, then the zones people usually meet, each as "City · GMT+8".
 * A zone saved earlier that isn't in the list (any real IANA id) is kept as an option, never dropped.
 * `at` is a local "YYYY-MM-DDTHH:mm" so the GMT label is right for that date (daylight saving).
 */
export function TimezoneSelect({ home, at, current, unsetLabel, ...props }: { home: string; at?: string | null; current?: string | null; unsetLabel?: string } & ComponentProps<"select">) {
  // Without a date the label is for today, which only the browser knows (and the server's zone data can differ), so the
  // city alone is shown until the page is live: the server HTML and the first browser render then match.
  const today = useClientValue(localISODate, null);
  const label = (id: string) => (at ? `${zoneCity(id)} · ${gmtLabel(id, at)}` : today ? `${zoneCity(id)} · ${gmtLabel(id, `${today}T12:00`)}` : zoneCity(id));
  const others = ZONES.filter((z) => z.id !== home);
  const extra = current && current !== home && !ZONES.some((z) => z.id === current) ? current : null;
  return (
    <Select {...props}>
      {unsetLabel && <option value="">{unsetLabel}</option>}
      <option value={home}>{label(home)} (home)</option>
      {extra && <option value={extra}>{label(extra)}</option>}
      {others.map((z) => (
        <option key={z.id} value={z.id}>
          {label(z.id)}
        </option>
      ))}
    </Select>
  );
}
