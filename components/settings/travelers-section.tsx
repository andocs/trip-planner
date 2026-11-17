"use client";

import { Check, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyHint, List, ListButton } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { useGuests } from "@/lib/queries/guests";
import { useRows, type Row } from "@/lib/queries/table";
import { bySort, nextSort, useSheet } from "@/lib/use-sheet";
import dynamic from "next/dynamic";

/** Form sheets load on first open, keeping zod / react-hook-form / vaul out of the page's initial JS. */
const TravelerSheet = dynamic(() => import("./travelers-sheet").then((m) => m.TravelerSheet), { ssr: false });
export { TravelerSheet };

export function TravelersSection() {
  const { data: travelers, isPending } = useRows("travelers", bySort);
  const sheet = useSheet<Row<"travelers">>();
  // Travelers who joined with the invite link: Google linked (an email) or still a guest on one browser. Owner only.
  const { owner, byUser, loaded } = useGuests();
  const chip = (t: Row<"travelers">) => {
    if (!owner || !loaded || !t.user_id) return undefined;
    const g = byUser.get(t.user_id);
    if (!g)
      return <span className="inline-flex min-h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-bold text-fg-muted">No access</span>;
    return g.email ? (
      <span title={g.email} className="inline-flex min-h-6 items-center gap-1 rounded-full bg-teal-tint px-2.5 text-xs font-bold text-teal">
        <Check className="size-3" strokeWidth={3} aria-hidden />
        Google
      </span>
    ) : (
      <span className="inline-flex min-h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-bold text-fg-muted">Guest</span>
    );
  };

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
              trailing={chip(t)}
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
