"use client";

import { useState } from "react";
import { ChipGroup } from "@/components/ideas/chips";
import { useTrip } from "@/components/trip-gate";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormFooter } from "@/components/ui/form-footer";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { dateForDay, BUFFER_KINDS, BUFFER_LABEL, COMMUTE_LABEL, COMMUTE_MODES, connectorDetails, DURATION_PRESETS, type ConnectorDetails, type InsertPlan } from "@/lib/itinerary";
import { useMoveItems } from "@/lib/queries/itinerary";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { formatDuration } from "@/lib/format";

export type ConnectorTarget = {
  kind: "commute" | "buffer";
  day: number | null;
  /** Add mode: its position between the two places, and any renumbering of the day that has to come first. */
  plan?: InsertPlan;
  /** Edit mode: the connector itself. */
  existing?: Row<"itinerary_items">;
};

const parseMinutes = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 24 * 60 ? n : null;
};

/**
 * Add or edit a commute or a break between two places. Durations are typed in (a few presets, or any number of
 * minutes): nothing here calls a routing service, so it costs nothing. Where it may go is decided before this opens.
 */
export function ConnectorSheet({ target, onClose }: { target: ConnectorTarget; onClose: () => void }) {
  const trip = useTrip();
  const insert = useInsertRow("itinerary_items", "connector");
  const update = useUpdateRow("itinerary_items", "connector");
  const remove = useDeleteRow("itinerary_items", "connector");
  const move = useMoveItems();
  const editing = !!target.existing;
  const d0 = connectorDetails(target.existing?.details);

  const [kind, setKind] = useState<"commute" | "buffer">(target.kind);
  const [mode, setMode] = useState<string>((target.existing?.kind === "buffer" ? d0.bufferKind : d0.mode) ?? "");
  const [minutes, setMinutes] = useState(target.existing?.duration_min ? String(target.existing.duration_min) : "");
  const [cost, setCost] = useState(d0.cost !== undefined ? String(d0.cost) : "");
  const [note, setNote] = useState(d0.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const labels = kind === "commute" ? COMMUTE_LABEL : BUFFER_LABEL;
  const options = kind === "commute" ? COMMUTE_MODES : BUFFER_KINDS;
  const mins = parseMinutes(minutes);

  const save = () => {
    if (mins === null) return setError("Enter the length in minutes, from 1 to 1440.");
    const costNum = cost.trim() === "" ? undefined : Number(cost.replace(/,/g, ""));
    if (costNum !== undefined && (!Number.isFinite(costNum) || costNum < 0)) return setError("Cost must be a number, or empty.");
    const details: ConnectorDetails = { ...(mode ? (kind === "commute" ? { mode } : { bufferKind: mode }) : {}), ...(kind === "commute" && costNum !== undefined ? { cost: costNum } : {}), ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}) };
    const label = mode ? (labels as Record<string, string>)[mode] : kind === "commute" ? "Commute" : "Break";
    if (editing) {
      update.mutate({ id: target.existing!.id, patch: { activity: label, duration_min: mins, details } });
    } else {
      if (target.plan?.renumber.length) move.mutate(target.plan.renumber);
      insert.mutate([
        {
          id: newId(),
          kind,
          activity: label,
          duration_min: mins,
          details,
          day: target.day,
          on_date: dateForDay(trip.start_date, target.day),
          position: target.plan?.position ?? 1000,
        },
      ]);
    }
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${editing ? "Edit" : "Add"} ${kind === "commute" ? "commute" : "rest"}`}
      description="Between two places. Lengths are typed in; nothing here looks up routes."
      footer={
        <FormFooter
          mode={editing ? "edit" : "add"}
          formId="connector-form"
          onCancel={onClose}
          onDelete={() => {
            remove(target.existing!, label(kind, mode, labels));
            onClose();
          }}
        />
      }
    >
      <form
        id="connector-form"
        noValidate
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!editing && (
          <Segmented<"commute" | "buffer">
            label="Type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setMode("");
            }}
            className="flex w-full"
            options={[
              { value: "commute", label: "Commute" },
              { value: "buffer", label: "Rest" },
            ]}
          />
        )}
        <ChipGroup
          label={kind === "commute" ? "Mode" : "Kind"}
          options={options}
          value={mode}
          onChange={(v) => setMode(v as string)}
          display={(o) => (labels as Record<string, string>)[o] ?? o}
        />
        <ChipGroup
          label="Length"
          options={DURATION_PRESETS.map(String)}
          value={minutes}
          onChange={(v) => setMinutes(v as string)}
          display={(o) => formatDuration(Number(o))}
        />
        <Field label="Or any number of minutes" error={error && mins === null ? error : undefined}>
          {(p) => <Input {...p} value={minutes} onChange={(e) => (setMinutes(e.target.value), setError(null))} inputMode="numeric" placeholder="30" />}
        </Field>
        {kind === "commute" && (
          <Field label={`Cost (${trip.home_currency}, optional)`} error={error && mins !== null ? error : undefined}>
            {(p) => <Input {...p} value={cost} onChange={(e) => (setCost(e.target.value), setError(null))} inputMode="decimal" placeholder="0" />}
          </Field>
        )}
        <Field label="Note (optional)">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} placeholder="Grab from the lake to the hotel" />}
        </Field>
      </form>
    </Sheet>
  );
}

const label = (kind: "commute" | "buffer", mode: string, labels: Record<string, string>) => (mode ? labels[mode] : kind === "commute" ? "Commute" : "Break");
