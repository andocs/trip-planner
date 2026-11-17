"use client";

import { IdeaModal } from "@/components/ideas/idea-modal";
import { useRows } from "@/lib/queries/table";

/**
 * The add sheet that opens from anywhere (the floating button, the N shortcut, an empty board): the same
 * "One place | Paste a list" sheet as the Places board, starting on a stay.
 */
export function AddPlace({ startPaste, onClose }: { startPaste: boolean; onClose: () => void }) {
  const stops = useRows("destinations");
  const cities = [...new Set((stops.data ?? []).map((s) => s.city).filter(Boolean) as string[])];
  return <IdeaModal kind="stay" cities={cities} startMode={startPaste ? "paste" : "one"} onClose={onClose} />;
}
