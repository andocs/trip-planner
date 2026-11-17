import { useSyncExternalStore } from "react";
import type { MapViewProps } from "@/components/map/map-view";

/**
 * One Google map for the whole app session. Every map Google creates is a billed load, so the map is built once, lives in
 * a detached <div> (the "host"), and is moved into whichever screen asks for it (Home, Itinerary, Discover, the wizard).
 * This file is the small store between those screens and the host; it has no Google code, so screens stay light.
 */
export type SceneProps = Omit<MapViewProps, "className" | "requireContent">;

type State = {
  /** The screen that has the map right now. */
  owner: symbol | null;
  props: SceneProps | null;
  /** True once any screen has asked for the map; from then on the host keeps it alive. */
  started: boolean;
  /** Google refused to load (key, referrer, billing, offline). */
  failed: boolean;
  /** Counts each move into a screen, so the scene frames its content again there. */
  attach: number;
};

let state: State = { owner: null, props: null, started: false, failed: false, attach: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const SERVER: State = state;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
/** The whole state; only the host should use this (it changes whenever a screen publishes new props). */
export const useSharedMap = (): State => useSyncExternalStore(subscribe, () => state, () => SERVER);
/** Just one field, so a screen re-renders only when that field changes, never when another screen's props are published. */
export const useSharedMapField = <K extends keyof State>(key: K): State[K] => useSyncExternalStore(subscribe, () => state[key], () => SERVER[key]);

let host: HTMLDivElement | null = null;
/** The detached element the Google map is drawn in. Browser only. */
export function mapHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.style.cssText = "width:100%;height:100%";
  }
  return host;
}

/** A screen takes the map: it is moved into `box` and shows these props until the screen lets go. */
export function claimMap(owner: symbol, box: HTMLElement, props: SceneProps) {
  const el = mapHost();
  if (el.parentNode !== box) box.appendChild(el);
  set({ owner, props, started: true, attach: state.attach + 1 });
}
export function updateMap(owner: symbol, props: SceneProps) {
  if (state.owner === owner) set({ props });
}
/** The screen is going away. If another one has already taken the map, nothing happens. */
export function releaseMap(owner: symbol, box: HTMLElement | null) {
  if (state.owner !== owner) return;
  if (box && host && host.parentNode === box) box.removeChild(host);
  set({ owner: null });
}
export const markMapFailed = () => {
  if (!state.failed) set({ failed: true });
};
