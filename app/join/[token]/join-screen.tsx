"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GateLayout, gateTitle } from "@/components/gate/gate-layout";
import { Board } from "@/components/ui/flap-digits";
import { Button } from "@/components/ui/button";
import { joinTrip } from "@/lib/queries/trip";
import { withTrip } from "@/lib/trip-path";
import { getCurrentUser, getSupabase, GuestSignInOff, linkGoogle } from "@/lib/supabase/client";
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
  const [guestOff, setGuestOff] = useState(false);
  // Joined as a guest: offer to keep access with Google before going in.
  const [offer, setOffer] = useState(false);
  // Already on a trip: ask before adding this one to the list (a stray link must not add a trip by accident).
  const [ask, setAsk] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const started = useRef(false);
  const runJoin = useRef<() => void>(() => {});

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    const run = () =>
      joinTrip(token)
        .then(async (tripId) => {
          await qc.invalidateQueries();
          const me = await getCurrentUser();
          if (me?.isAnonymous) {
            setJoined(tripId);
            return setOffer(true);
          }
          router.replace(withTrip(tripId, "/")); // opens the joined trip and drops the token from the address bar and history
        })
        .catch((e: unknown) => {
          if (e instanceof GuestSignInOff) setGuestOff(true);
          setError(errorMessage(e));
        });
    runJoin.current = () => {
      setAsk(false);
      void run();
    };
    void (async () => {
      const me = await getCurrentUser();
      if (me) {
        const { data } = await getSupabase().rpc("my_trips");
        if ((data ?? []).some((t) => !t.archived_at)) return setAsk(true);
      }
      void run();
    })().catch(() => void run());
  }, [token, router, qc]);

  if (ask)
    return (
      <GateLayout>
        <div className="flex flex-col gap-3.5">
          <h1 className={gateTitle}>Add this trip to your list?</h1>
          <p className="text-fg-muted">You are already on a trip. Joining adds this one next to it; nothing you have changes, and you can switch between them any time.</p>
          <Button size="lg" className="mt-1.5 w-full" onClick={() => runJoin.current()}>
            Add this trip
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => router.replace("/")}>
            Not now
          </Button>
        </div>
      </GateLayout>
    );

  if (offer)
    return (
      <GateLayout>
        <div className="flex flex-col gap-3.5">
          <h1 className={gateTitle}>You&rsquo;re in</h1>
          <p className="text-fg-muted">
            Connect your Google account so this trip stays yours on every phone and laptop, and your votes and comments aren&rsquo;t lost if you clear your browser. We only use it to recognise you.
          </p>
          <Button
            size="lg"
            className="mt-1.5 w-full"
            onClick={() =>
              linkGoogle("/").catch((e: unknown) => toast.error(`Couldn't connect Google: ${errorMessage(e)}`))
            }
          >
            <Link2 className="size-5" aria-hidden />
            Continue with Google
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => router.replace(withTrip(joined, "/"))}>
            Not now
          </Button>
        </div>
      </GateLayout>
    );

  if (!error) return <Joining />;

  return (
    <GateLayout>
      <div role="alert" className="flex flex-col gap-3.5">
        <h1 className={gateTitle}>{guestOff ? "Guest links aren’t switched on yet" : "This invite link doesn’t work"}</h1>
        {guestOff ? (
          <p className="text-fg-muted">
            The link is fine, but the app isn&rsquo;t accepting guests yet. Tell the trip owner: guest (anonymous) sign-in needs to be turned on in the app&rsquo;s Supabase settings.
          </p>
        ) : (
          <p className="text-fg-muted">
            {error}. The owner may have replaced the link or removed your access. Ask for a new one.
          </p>
        )}
        <Button asChild variant="secondary" size="lg" className="mt-1.5 w-full">
          <Link href="/">Back to start</Link>
        </Button>
      </div>
    </GateLayout>
  );
}
