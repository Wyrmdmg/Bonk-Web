import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/bonks.functions";

// Whether the signed-in user may moderate any room. The answer comes from the
// server because the list of moderators used to be a string in this file, and
// anything in this file is in the bundle every visitor downloads.
//
// This only decides what the page offers. Every action it unlocks is checked
// again server-side, so a tampered "true" here shows buttons that fail.

export function useIsAdmin(signedIn: boolean) {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setAdmin(false);
      return;
    }
    let alive = true;
    amIAdmin()
      .then((r) => alive && setAdmin(r.admin))
      .catch(() => alive && setAdmin(false));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  return admin;
}
