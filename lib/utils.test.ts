import { describe, expect, it } from "vitest";
import { errorMessage } from "./utils";

describe("errorMessage", () => {
  it("reads Error and Supabase-style error objects", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "RLS says no", code: "42501" })).toBe("RLS says no");
    expect(errorMessage(42, "fallback")).toBe("fallback");
  });
});
