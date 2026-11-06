import type { Metadata } from "next";
import { InviteOnly } from "@/components/gate/invite-only";

export const metadata: Metadata = { title: "Invite only" };

export default function Page() {
  return <InviteOnly />;
}
