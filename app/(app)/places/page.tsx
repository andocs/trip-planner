import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/screens/placeholder";

export const metadata: Metadata = { title: "Places" };

export default function Page() {
  return <PlaceholderScreen title="Places" milestone={6} />;
}
