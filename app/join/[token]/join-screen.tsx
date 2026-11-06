"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { Board } from "@/components/ui/board";
import { Button } from "@/components/ui/button";
import { joinTrip } from "@/lib/queries/trip";
import { errorMessage } from "@/lib/utils";

export function Joining() {
  return (
    <GateLayout>
      <div className="flex items-center gap-3.5 py-2" aria-live="polite">
        <Board value="0" />
        <div>
          <h1 className="font-display text-2xl font-extrabold">Joining the trip…</h1>
          <p className="text-sm text-fg-muted">Checking your invite.</p>
        </div>
      </div>
    </GateLayout>
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
        await qc.invalidateQueries();
        router.replace("/"); // drops the token from the address bar and history
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [token, router, qc]);

  if (!error) return <Joining />;

  return (
    <GateLayout>
      <div role="alert" className="flex flex-col gap-3.5">
        <h1 className={gateTitle}>This invite link doesn&rsquo;t work</h1>
        <p className="text-fg-muted">
          {error}. The owner may have replaced the link or removed your access. Ask for a new one.
        </p>
        <Button asChild variant="secondary" size="lg" className="mt-1.5 w-full">
          <Link href="/">Back to start</Link>
        </Button>
      </div>
    </GateLayout>
  );
}
