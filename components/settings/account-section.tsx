"use client";

import { Link2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOutAndLeave } from "@/components/gate/no-access";
import { useRole } from "@/components/trip-gate";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useUser } from "@/lib/queries/trip";
import { linkGoogle } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

/** Who is signed in, sign out, and (for link viewers) a way to keep access on every device. */
export function AccountSection() {
  const user = useUser().data;
  const role = useRole();
  if (!user) return null;

  async function keepAccess() {
    try {
      await linkGoogle("/");
    } catch (e) {
      toast.error(`Couldn't connect Google: ${errorMessage(e)}`);
    }
  }

  return (
    <Card>
      <CardTitle>Account</CardTitle>
      <p className="mt-1 text-sm text-fg-muted">
        {user.email ? (
          <>
            Signed in as <b className="text-fg">{user.email}</b> · {role === "owner" ? "Owner" : "Viewer"}
          </>
        ) : (
          "Joined with an invite link on this device."
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {user.isAnonymous && (
          <Button variant="outline" onClick={keepAccess}>
            <Link2 className="size-4" aria-hidden />
            Keep access with Google
          </Button>
        )}
        <Button variant="ghost" onClick={signOutAndLeave}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </Card>
  );
}
