"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/queries/keys";
import { joinTrip } from "@/lib/queries/trip";
import { errorMessage } from "@/lib/utils";

export function Joining() {
  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="font-medium">Joining the trip…</p>
    </div>
  );
}

export function JoinScreen() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    joinTrip(token)
      .then(async () => {
        await qc.invalidateQueries({ queryKey: qk.activeTrip });
        router.replace("/"); // drops the token from the address bar and history
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [token, router, qc]);

  if (!error) return <Joining />;

  return (
    <div role="alert" className="max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h1 className="text-lg font-bold">This invite link doesn&rsquo;t work</h1>
      <p className="mt-2 text-sm text-fg-muted">{error}. Ask whoever shared it for a fresh link.</p>
      <Button asChild className="mt-4">
        <Link href="/">Go to my trip</Link>
      </Button>
    </div>
  );
}
