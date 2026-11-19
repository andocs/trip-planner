import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/gate/error-screen";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <NotFoundScreen />;
}
