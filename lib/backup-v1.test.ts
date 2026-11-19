import { describe, expect, it } from "vitest";
import { mergeV1Stays, parseBackup } from "./backup";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("version 1 backups (stays in a table of their own) are still readable", () => {
  const A = id(50);
  const B = id(51);
  const S1 = id(60);
  const S2 = id(61);
  const S3 = id(62);
  const S4 = id(63);
  const ideas = [
    { id: A, hotel: "Idea A", city: "Hanoi", room: "idea note", total: 1000, nights: 2, decision: "confirmed", details: { stayType: "hotel", checkInDay: 1 } },
    { id: B, hotel: "Idea B (never booked)", decision: "draft", details: {} },
  ];
  const stays = [
    { id: S1, hotel: "Stay A", room: "Deluxe", note: "stay note", city: "Hanoi", check_in: "2026-06-16", check_out: "2026-06-19", total: 3600, confirmation: "C1", status: "Booked", details: { ideaId: A, cancellation: "free", freeUntil: "2026-06-14" }, created_at: "t1" },
    { id: S2, hotel: "Second on A", check_in: null, check_out: null, total: null, status: "Planned", details: { ideaId: A }, created_at: "t2" },
    { id: S3, hotel: "Unlinked", check_in: "2026-06-19", check_out: "2026-06-22", status: "Done", details: {}, created_at: "t3" },
    { id: S4, hotel: "Dangling", status: "Cancelled", details: { ideaId: id(99) }, created_at: "t4" },
  ];
  const expenses = [
    { id: id(70), source_table: "stays", source_id: S1 },
    { id: id(71), source_table: "stays", source_id: S3 },
    { id: id(72), source_table: "stays", source_id: id(98) }, // points at a stay that is not in the file
    { id: id(73), source_table: "flights", source_id: id(40) },
    { id: id(74), source_table: null, source_id: null },
  ];
  const out = mergeV1Stays(ideas, stays, expenses);
  const byId = new Map(out.hotel_ideas.map((r) => [r.id, r]));

  it("merges a stay into the idea behind it, which keeps its id", () => {
    expect(byId.get(A)).toMatchObject({ is_stay: true, hotel: "Stay A", check_in: "2026-06-16", check_out: "2026-06-19", stay_status: "Booked", confirmation: "C1", total: 3600, nights: 3, room: "stay note" });
    // the stay's details are laid over the idea's, the room goes to details.rooms, and there is no ideaId left
    expect(byId.get(A)!.details).toEqual({ stayType: "hotel", checkInDay: 1, cancellation: "free", freeUntil: "2026-06-14", rooms: "Deluxe" });
  });

  it("turns every other stay into a new idea with the stay's own id", () => {
    for (const sid of [S2, S3, S4]) expect(byId.get(sid)).toMatchObject({ is_stay: true, decision: "confirmed" });
    expect(byId.get(S3)).toMatchObject({ stay_status: "Done", nights: 3 });
    expect(byId.get(S4)).toMatchObject({ stay_status: "Cancelled" });
  });

  it("leaves an idea that was never booked alone", () => {
    expect(byId.get(B)).toEqual(ideas[1]);
    expect(out.hotel_ideas).toHaveLength(2 + 3);
  });

  it("points expenses logged from a stay at the idea, and drops a link to nothing", () => {
    const by = new Map(out.expenses.map((e) => [e.id, e]));
    expect(by.get(id(70))).toMatchObject({ source_table: "hotel_ideas", source_id: A });
    expect(by.get(id(71))).toMatchObject({ source_table: "hotel_ideas", source_id: S3 });
    expect(by.get(id(72))).toMatchObject({ source_table: null, source_id: null });
    expect(by.get(id(73))).toMatchObject({ source_table: "flights" });
    expect(by.get(id(74))).toEqual(expenses[4]);
  });

  it("parseBackup converts a whole version 1 file", () => {
    const file = JSON.stringify({ format: "trip-planner-backup", version: 1, exportedAt: "x", trip: { name: "T" }, tables: { hotel_ideas: ideas, stays, expenses } });
    const parsed = parseBackup(file);
    expect(parsed.version).toBe(2);
    expect(parsed.tables.hotel_ideas.filter((r) => r.is_stay)).toHaveLength(4);
    expect(parsed.tables).not.toHaveProperty("stays");
  });

  it("a version 2 file keeps the booking columns on its ideas", () => {
    const file = JSON.stringify({ format: "trip-planner-backup", version: 2, exportedAt: "x", trip: {}, tables: { hotel_ideas: [{ id: A, hotel: "H", is_stay: true, check_in: "2026-06-16", stay_status: "Booked", confirmation: "C" }] } });
    expect(parseBackup(file).tables.hotel_ideas[0]).toMatchObject({ is_stay: true, check_in: "2026-06-16", confirmation: "C" });
  });
});
