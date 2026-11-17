import { beforeAll, describe, expect, it } from "vitest";
import { claimMap, mapHost, releaseMap, updateMap } from "@/components/map/shared-map";

/** A tiny stand-in for DOM nodes: just enough parent bookkeeping. */
class Node_ {
  parentNode: Node_ | null = null;
  style: Record<string, string> = {};
  children: Node_[] = [];
  appendChild(c: Node_) {
    c.parentNode?.removeChild(c);
    c.parentNode = this;
    this.children.push(c);
  }
  removeChild(c: Node_) {
    this.children = this.children.filter((x) => x !== c);
    c.parentNode = null;
  }
}

beforeAll(() => {
  (globalThis as unknown as { document: unknown }).document = { createElement: () => new Node_() };
});

describe("the shared map", () => {
  it("is one element that moves from screen to screen and is never rebuilt", () => {
    const a = new Node_();
    const b = new Node_();
    const first = Symbol("a");
    const second = Symbol("b");
    claimMap(first, a as never, { stops: [] });
    const host = mapHost();
    expect(host.parentNode).toBe(a);
    // The next screen mounts before the old one's cleanup runs.
    claimMap(second, b as never, { stops: [] });
    expect(mapHost()).toBe(host);
    expect(host.parentNode).toBe(b);
    // The old screen's late cleanup must not pull the map out of the new one.
    releaseMap(first, a as never);
    expect(host.parentNode).toBe(b);
    updateMap(first, { stops: [{ id: 1, name: "x", lat: 0, lng: 0 }] }); // ignored: not the owner
    releaseMap(second, b as never);
    expect(host.parentNode).toBeNull();
  });
});
