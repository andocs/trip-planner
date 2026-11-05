import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/screens/placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <PlaceholderScreen title="Settings" milestone={2} />;
}
