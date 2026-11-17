"use client";

import { useEffect } from "react";
import { useUser } from "@/lib/queries/trip";
import { syncGoogleProfile } from "@/lib/supabase/client";

/**
 * Renders nothing. Once a signed-in person has a Google identity (a guest who just connected it, or the owner), copies
 * the Google name and photo into their profile if it is empty, and refreshes the email and name the owner sees on the
 * Travelers list. Once per person per browser session; a failure is silent and tried again next time.
 */
export function GoogleProfileSync() {
  const user = useUser().data;
  const id = user && !user.isAnonymous ? user.id : null;
  useEffect(() => {
    if (!id) return;
    const key = `google-sync:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // storage unavailable: just run it
    }
    syncGoogleProfile()
      .then((done) => {
        if (!done) return;
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // fine
        }
      })
      .catch(() => {});
  }, [id]);
  return null;
}
