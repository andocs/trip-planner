"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useGuests, useRemoveGuestAccess } from "@/lib/queries/guests";
import { RowSheet } from "@/components/ui/row-sheet";
import { newId, useDeleteRow, useInsertRow, useUpdateRow, type Row } from "@/lib/queries/table";
import { requiredText } from "@/lib/schemas";
import { useSheet } from "@/lib/use-sheet";

const Schema = z.object({ name: requiredText("Name", 40) });
type Values = z.infer<typeof Schema>;
export function TravelerSheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Row<"travelers">>>; sort: number }) {
  const insert = useInsertRow("travelers", "traveler");
  const update = useUpdateRow("travelers", "traveler");
  const remove = useDeleteRow("travelers", "traveler");
  // For a traveler who joined with the invite link, the owner can also take their access away.
  const { byUser } = useGuests();
  const removeAccess = useRemoveGuestAccess();
  const guest = sheet.row?.user_id ? byUser.get(sheet.row.user_id) : undefined;
  const { register, handleSubmit, reset, formState, setFocus } = useForm<Values>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    if (sheet.open) reset({ name: sheet.row?.name ?? "" });
  }, [sheet.open, sheet.row, reset]);

  const onSubmit = handleSubmit(({ name }) => {
    if (sheet.row) {
      update.mutate({ id: sheet.row.id, patch: { name } });
      sheet.close();
    } else {
      insert.mutate([{ id: newId(), name, sort }]);
      reset({ name: "" });
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
      {guest && (
        <div className="mt-4 space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <p className="text-sm">
            <b>{guest.email ? `Connected with Google (${guest.email})` : "Joined with the invite link, not connected to Google"}</b>
          </p>
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
