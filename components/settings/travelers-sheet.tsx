"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { UserCog, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useGuests, useRemoveGuestAccess, useSetMemberRole } from "@/lib/queries/guests";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { METHODS, PaymentSchema, parsePayment, toPayment } from "@/lib/payment";
import { requiredText } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

const Schema = z.object({ name: requiredText("Name", 40), ...PaymentSchema.shape });
type Values = z.input<typeof Schema>;
export function TravelerSheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Row<"travelers">>>; sort: number }) {
  const insert = useInsertRow("travelers", "traveler");
  const update = useUpdateRow("travelers", "traveler");
  const remove = useDeleteRow("travelers", "traveler");
  // For a traveler who joined with the invite link, the owner can also take their access away.
  const { byUser } = useGuests();
  const removeAccess = useRemoveGuestAccess();
  const setRole = useSetMemberRole();
  const guest = sheet.row?.user_id ? byUser.get(sheet.row.user_id) : undefined;
  const { register, handleSubmit, reset, formState, setFocus } = useForm<Values>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    if (sheet.open) {
      const pay = parsePayment(sheet.row?.payment);
      reset({ name: sheet.row?.name ?? "", gcash: pay?.gcash ?? "", maya: pay?.maya ?? "", maribank: pay?.maribank ?? "", qrph: pay?.qrph ?? "", other: pay?.other ?? "" });
    }
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit(({ name, ...methods }) => {
    const payment = toPayment(methods);
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: { name, payment } });
      sheet.close();
    } else {
      insert.mutate([{ id: newId(), name, sort, payment }]);
      reset({ name: "", gcash: "", maya: "", maribank: "", qrph: "", other: "" });
      setFocus("name");
    }
  });

  return (
    <RowSheet
      open={sheet.open}
      onOpenChange={sheet.setOpen}
      title={sheet.row ? "Edit traveler" : "Add traveler"}
      mode={sheet.mode}
      onSubmit={onSubmit}
      onDelete={
        sheet.row
          ? () => {
              remove(sheet.row!, sheet.row!.name);
              sheet.close();
            }
          : undefined
      }
    >
      <Field
        label="Name"
        error={formState.errors.name?.message}
        hint={sheet.row ? "Removing a traveler keeps their expenses but clears “paid by”." : "Add one, then the next."}
      >
        {(p) => <Input {...p} {...register("name")} autoComplete="off" autoFocus />}
      </Field>
      <div className="mt-4 space-y-3">
        <p className="text-sm font-semibold">How to pay {sheet.row?.name ?? "them"} back</p>
        <p className="text-[13px] text-fg-muted">Shown to everyone on the trip in Settle up, with a copy button. Numbers only: never a PIN, password or card number.</p>
        {METHODS.map((m) => (
          <Field key={m.key} label={m.label} hint={m.hint} error={formState.errors[m.key]?.message}>
            {(p) => <Input {...p} {...register(m.key)} autoComplete="off" />}
          </Field>
        ))}
      </div>
      {guest && (
        <div className="mt-4 space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <p className="text-sm">
            <b>{guest.email ? `Connected with Google (${guest.email})` : "Joined with the invite link, not connected to Google"}</b>
          </p>
          <p className="text-[13px] text-fg-muted">
            {guest.role === "editor"
              ? "Editor: plans with you (places, itinerary, flights, stays, spend, packing). They can't change who has access, the invite link, or start a new trip."
              : "Viewer: can look, vote and comment, but not change the plan."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={setRole.isPending}
            onClick={() => setRole.mutate({ userId: guest.user_id, role: guest.role === "editor" ? "viewer" : "editor" })}
          >
            <UserCog className="size-4" aria-hidden />
            {guest.role === "editor" ? "Make viewer" : "Make editor"}
          </Button>
          <p className="text-[13px] text-fg-muted">Removing access signs them out of the trip. They stay a traveler, so their expenses are kept. They can only return with a new invite link.</p>
          <Button
            type="button"
            variant="danger"
            size="xs"
            disabled={removeAccess.isPending}
            onClick={() =>
              removeAccess.mutate(guest.user_id, {
                onSuccess: () => sheet.close(),
              })
            }
          >
            <UserX className="size-4" aria-hidden />
            Remove access
          </Button>
        </div>
      )}
    </RowSheet>
  );
}
