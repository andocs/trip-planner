import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinScreen, Joining } from "./join-screen";

export const metadata: Metadata = { title: "Join trip", referrer: "no-referrer" };

export default function Page() {
  return (
    <Suspense fallback={<Joining />}>
      <JoinScreen />
    </Suspense>
  );
}
