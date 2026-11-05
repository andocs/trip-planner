import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinScreen, Joining } from "./join-screen";

export const metadata: Metadata = { title: "Join trip", referrer: "no-referrer" };

export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <Suspense fallback={<Joining />}>
        <JoinScreen />
      </Suspense>
    </main>
  );
}
