import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/screens/placeholder";

export const metadata: Metadata = { title: "Spend" };

export default function Page() {
  return <PlaceholderScreen title="Spend" milestone={3} />;
}
