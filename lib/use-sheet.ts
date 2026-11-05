"use client";

import { useState } from "react";

/**
 * Open/close state for an add/edit sheet. `row` is set in edit mode.
 * `mounted` turns true on first open and stays true, so a lazily loaded sheet is only
 * fetched when needed and can still animate closed.
 */
export function useSheet<R>() {
  const [state, setState] = useState<{ open: boolean; row: R | null; mounted: boolean }>({
    open: false,
    row: null,
    mounted: false,
  });
  return {
    open: state.open,
    mounted: state.mounted,
    row: state.row,
    mode: state.row ? ("edit" as const) : ("add" as const),
    openAdd: () => setState({ open: true, row: null, mounted: true }),
    openEdit: (row: R) => setState({ open: true, row, mounted: true }),
    setOpen: (open: boolean) => setState((s) => ({ ...s, open })),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}

/** Sort by `sort`, then creation time. */
export const bySort = <T extends { sort: number; created_at: string }>(a: T, b: T) =>
  a.sort - b.sort || a.created_at.localeCompare(b.created_at);

export const nextSort = (rows: { sort: number }[] | undefined) =>
  (rows ?? []).reduce((m, r) => Math.max(m, r.sort), -1) + 1;
