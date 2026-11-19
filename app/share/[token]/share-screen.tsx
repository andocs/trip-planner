"use client";

import { useQuery } from "@tanstack/react-query";
import { BedDouble, CalendarDays, Eye, Plane } from "lucide-react";
import { useParams } from "next/navigation";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateRange, formatDateTime, formatDay, timeRange } from "@/lib/format";
import { fetchShared, groupShared, type SharedTrip } from "@/lib/share";

/** The read-only trip page behind a share link. No sign-in, no edit controls, nothing private (see migration 30). */
export function ShareScreen() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ["shared-trip", token],
    queryFn: () => fetchShared(token),
    retry: false,
    staleTime: 60_000,
  });

  if (q.isPending)
    return (
      <GateLayout>
        <h1 className={gateTitle}>Opening the trip…</h1>
        <p className="text-fg-muted" aria-live="polite">Loading the shared plan.</p>
      </GateLayout>
    );
  if (q.isError)
    return (
      <GateLayout>
        <h1 className={gateTitle}>Couldn&apos;t load the trip</h1>
        <p className="text-fg-muted">Check your connection and open the link again.</p>
      </GateLayout>
    );
  if (!q.data)
    return (
      <GateLayout>
        <h1 className={gateTitle}>This link isn&apos;t active</h1>
        <p className="text-fg-muted">It may have been replaced or switched off. Ask whoever planned the trip for a new link.</p>
      </GateLayout>
    );
  return <SharedTripView trip={q.data} />;
}

function SharedTripView({ trip }: { trip: SharedTrip }) {
  const days = groupShared(trip.itinerary, trip.startDate);
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-2 rounded-full bg-teal-tint px-3 py-1.5 text-sm font-bold text-teal">
          <Eye className="size-4" aria-hidden />
          Shared view only
        </p>
        <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight">{trip.name}</h1>
        <p className="text-fg-muted">
          {[trip.destination, formatDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(" · ")}
        </p>
      </header>

      {trip.flights.length > 0 && (
        <Card className="space-y-3">
          <CardTitle className="flex items-center gap-2">
            <Plane className="size-5" aria-hidden />
            Flights
          </CardTitle>
          <ul className="space-y-3">
            {trip.flights.map((f, i) => (
              <li key={i} className="space-y-0.5">
                <p className="font-bold">
                  {f.from ?? "?"} to {f.to ?? "?"}
                  {f.status && f.status !== "Planned" ? <span className="ml-2 text-sm font-medium text-fg-muted">{f.status}</span> : null}
                </p>
                <p className="text-sm text-fg-muted">
                  {[[f.airline, f.flightNo].filter(Boolean).join(" "), f.departsAt ? `Departs ${formatDateTime(f.departsAt)}` : null, f.arrivesAt ? `Arrives ${formatDateTime(f.arrivesAt)}` : null, f.terminal ? `Terminal ${f.terminal}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {trip.stays.length > 0 && (
        <Card className="space-y-3">
          <CardTitle className="flex items-center gap-2">
            <BedDouble className="size-5" aria-hidden />
            Stays
          </CardTitle>
          <ul className="space-y-3">
            {trip.stays.map((s, i) => (
              <li key={i} className="space-y-0.5">
                <p className="font-bold">{s.hotel}</p>
                <p className="text-sm text-fg-muted">
                  {[s.city, s.checkIn ? formatDateRange(s.checkIn, s.checkOut) : null].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-4">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-5" aria-hidden />
          Itinerary
        </CardTitle>
        {days.length === 0 && <p className="text-fg-muted">No activities have been planned yet.</p>}
        {days.map((d) => (
          <section key={d.day ?? "undated"} aria-label={d.day === null ? "Not yet scheduled" : `Day ${d.day}`} className="space-y-2">
            <h3 className="font-display text-base font-extrabold">
              {d.day === null ? "Not yet scheduled" : `Day ${d.day}`}
              {d.date ? <span className="ml-2 text-sm font-medium text-fg-muted">{formatDay(d.date)}</span> : null}
            </h3>
            <ol className="space-y-2">
              {d.stops.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-sm text-fg-muted tabular-nums">{s.atTime ? timeRange(s.atTime, s.durationMin) : "Anytime"}</span>
                  <span>
                    <span className="font-semibold">{s.activity}</span>
                    {s.city ? <span className="text-fg-muted"> · {s.city}</span> : null}
                    {s.tentative ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-fg-muted">Tentative</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </Card>

      <p className="pb-2 text-center text-xs text-fg-muted">Prices, booking numbers and notes are not shown on shared links.</p>
    </main>
  );
}
