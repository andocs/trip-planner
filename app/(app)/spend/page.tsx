import type { Metadata } from "next";
import { SpendScreen } from "@/components/screens/spend";

export const metadata: Metadata = { title: "Spend" };

export default function Page() {
  return <SpendScreen />;
}
