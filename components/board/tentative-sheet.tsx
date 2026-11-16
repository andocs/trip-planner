"use client";

import { useState } from "react";
import { useTrip } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { tripLength } from "@/lib/calc";
import type { Idea } from "@/lib/drafts";
import { useAddTentativeStop } from "@/lib/queries/ideas";
import { useRows } from "@/lib/queries/table";

/** Pick a day (and optionally a time) for a tentative stop. A draft stays dashed and uncounted until confirmed. */
export function TentativeSheet({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const trip = useTrip();
  const items = useRows("itinerary_items");
  const addStop = useAddTentativeStop();
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");

  const known = new Set<number>();
  for (const i of items.data ?? []) if (i.day !== null) known.add(i.day);
  const len = tripLength(trip.start_date, trip.end_date) ?? 0;
  for (let d = 1; d <= len; d++) known.add(d);
  const days = [...known].sort((a, b) => a - b);

  const submit = () => {
    const n = day === "" ? null : Number(day);
    const sample = (items.data ?? []).find((i) => i.day === n && i.on_date);
    addStop(idea, { day: n, on_date: sample?.on_date ?? null, at_time: time || null });
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add to itinerary"
      description={
        idea.decision === "draft"
          ? `“${idea.name}” will show as a dashed tentative stop. It doesn’t count until you confirm it.`
          : `“${idea.name}” is confirmed, so this becomes a normal stop.`
      }
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" onClick={submit}>
            Add stop
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Field label="Day">
          {(p) => (
            <Select {...p} value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">Unscheduled</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Time (optional)">
          {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}
