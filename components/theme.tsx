"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemePref = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function read(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", dark ? "#121826" : "#1F2A44");
}

export function setTheme(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply(pref);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (read() === "system") apply("system");
    cb();
  };
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onChange);
  };
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as ThemePref);
  return [pref, setTheme];
}
