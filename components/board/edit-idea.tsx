"use client";

import dynamic from "next/dynamic";
import type { Idea } from "@/lib/drafts";
import { useRows, useUpdateRow, type Row } from "@/lib/queries/table";
import { menuKey } from "@/components/places/menu-panel";
import type { Place } from "@/components/places/place-sheet";

const PlaceSheet = dynamic(() => import("@/components/places/place-sheet").then((m) => m.PlaceSheet), { ssr: false });
const HotelIdeaSheet = dynamic(() => import("@/components/plan/hotel-idea-sheet").then((m) => m.HotelIdeaSheet), {
  ssr: false,
});

/** A sheet-state object for a sheet that is open for exactly one row until `onClose`. */
function openFor<R>(row: R | undefined, onClose: () => void) {
  return {
    open: true,
    mounted: true,
    row: row ?? null,
    mode: "edit" as const,
    openAdd: () => {},
    openEdit: () => {},
    setOpen: (o: boolean) => {
      if (!o) onClose();
    },
    close: onClose,
  };
}

/**
 * Edit one idea's own details (name, city, price, notes, status) from the Board. It reuses the existing edit
 * sheets until the shared category modal replaces them, so nothing becomes uneditable in between.
 */
export function EditIdea({ idea, cities, onClose }: { idea: Idea; cities: string[]; onClose: () => void }) {
  if (idea.table === "hotel_ideas") return <EditHotel idea={idea} cities={cities} onClose={onClose} />;
  return <EditPlace idea={idea} cities={cities} onClose={onClose} />;
}

function EditHotel({ idea, cities, onClose }: { idea: Idea; cities: string[]; onClose: () => void }) {
  const row = useRows("hotel_ideas").data?.find((r) => r.id === idea.id);
  return <HotelIdeaSheet sheet={openFor<Row<"hotel_ideas">>(row, onClose)} cities={cities} />;
}

function EditPlace({ idea, cities, onClose }: { idea: Idea; cities: string[]; onClose: () => void }) {
  const table = idea.table === "food_places" ? "food_places" : "attractions";
  const row = useRows(table).data?.find((r) => r.id === idea.id) as Place | undefined;
  const menu = useRows("menu_items").data ?? [];
  const updateMenu = useUpdateRow("menu_items", "menu item");
  return (
    <PlaceSheet
      table={table}
      noun={table === "food_places" ? "food place" : "attraction"}
      sheet={openFor<Place>(row, onClose)}
      cities={cities}
      // Menu items are linked by restaurant name, so carry them over on rename.
      onRenamed={
        table === "food_places"
          ? (from, to) => {
              for (const m of menu.filter((x) => menuKey(x.restaurant) === menuKey(from)))
                updateMenu.mutate({ id: m.id, patch: { restaurant: to } });
            }
          : undefined
      }
    />
  );
}
