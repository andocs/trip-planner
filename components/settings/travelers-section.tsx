"use client";

import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyHint, List, ListButton } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const TravelerSheet = dynamic(() => import("./travelers-sheet").then((m) => m.TravelerSheet), { ssr: false });
export { TravelerSheet };

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
          {travelers.map((t, i) => (
            <ListButton
              key={t.id}
              leading={<Avatar name={t.name} index={i} />}
              title={t.name}
              onClick={() => sheet.openEdit(t)}
              label={`Edit ${t.name}`}
            />
          ))}
        </List>
      ) : (
        <EmptyHint>Add everyone who&rsquo;s splitting costs. Expenses are shared equally between them.</EmptyHint>
      )}
      {sheet.mounted && <TravelerSheet sheet={sheet} sort={nextSort(travelers)} />}
    </Card>
  );
}
