import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/screens/placeholder";

export const metadata: Metadata = { title: "Pack" };

export default function Page() {
  return <PlaceholderScreen title="Pack" milestone={6} />;
}
