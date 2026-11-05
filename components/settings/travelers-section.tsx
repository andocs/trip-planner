"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyHint, List, ListButton } from "@/components/ui/list";
import { RowSheet } from "@/components/ui/row-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { newId, useDeleteRow, useInsertRow, useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { requiredText } from "@/lib/schemas";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";

const Schema = z.object({ name: requiredText("Name", 40) });
type Values = z.infer<typeof Schema>;

export function TravelersSection() {
  const { data: travelers, isPending } = useRows("travelers", bySort);
  const sheet = useSheet<Row<"travelers">>();

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Travelers</CardTitle>
        <Button variant="ghost" size="sm" onClick={sheet.openAdd}>
          <UserPlus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {isPending ? (
        <Skeleton className="mt-3 h-14" />
      ) : travelers?.length ? (
        <List className="mt-2">
          {travelers.map((t) => (
            <ListButton
              key={t.id}
              leading={<Avatar name={t.name} />}
              title={t.name}
              onClick={() => sheet.openEdit(t)}
              label={`Edit ${t.name}`}
            />
          ))}
        </List>
      ) : (
        <EmptyHint>Add everyone who&rsquo;s splitting costs. Expenses are shared equally between them.</EmptyHint>
      )}
      <TravelerSheet sheet={sheet} sort={nextSort(travelers)} />
    </Card>
  );
}

function TravelerSheet({ sheet, sort }: { sheet: ReturnType<typeof useSheet<Row<"travelers">>>; sort: number }) {
  const insert = useInsertRow("travelers", "traveler");
  const update = useUpdateRow("travelers", "traveler");
  const remove = useDeleteRow("travelers", "traveler");
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
    </RowSheet>
  );
}
