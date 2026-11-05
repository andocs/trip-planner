import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/screens/placeholder";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return <PlaceholderScreen title="Plan" milestone={5} />;
}
