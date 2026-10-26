import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const configuration = z
  .object({
    url: z.url().refine((value) => new URL(value).protocol === "https:"),
    key: z.string().startsWith("sb_publishable_").min(25),
  })
  .safeParse({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });

// Capture the link type before the auth client consumes and clears the URL fragment.
const linkParameters = new URLSearchParams(
  import.meta.env.SSR ? "" : window.location.hash.slice(1),
);

const linkType = linkParameters.get("type");

let passwordSetupRequested = linkType === "invite" || linkType === "recovery";

export function consumePasswordSetupRequest() {
  const requested = passwordSetupRequested;
  passwordSetupRequested = false;

  return requested;
}

export const supabase = configuration.success
  ? createClient(configuration.data.url, configuration.data.key, {
      auth: {
        persistSession: true,
        storage: import.meta.env.SSR ? undefined : window.sessionStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function client() {
  if (!supabase) throw new Error("Configura la URL y la clave publicable de Supabase.");

  return supabase;
}
