import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareScreen } from "./share-screen";

// The token is in the address: never send it on as a referrer, and keep the page out of search results.
export const metadata: Metadata = { title: "Shared trip", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShareScreen />
    </Suspense>
  );
}
