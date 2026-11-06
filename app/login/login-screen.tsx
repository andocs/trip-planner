"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export function LoginScreen() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Google sign-in didn’t finish. Try again when you’re ready." : null,
  );
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(params.get("next") ?? "/");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <GateLayout>
      <h1 className={gateTitle}>Sign in</h1>
      <p className="text-fg-muted">
        Use the Google account the trip owner set up. Viewers can also sign in to keep access on every device.
      </p>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-danger-tint p-3.5 text-sm font-bold text-danger"
        >
          <CircleAlert className="size-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      <Button
        size="lg"
        disabled={busy}
        onClick={go}
        className="mt-1.5 w-full bg-white text-[#1f1f1f] ring-1 ring-[#747775] hover:bg-white/90 dark:bg-[#131314] dark:text-[#e3e3e3] dark:ring-[#8e918f] dark:hover:bg-[#131314]/90"
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleG />}
        Continue with Google
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/">Back</Link>
      </Button>
    </GateLayout>
  );
}
