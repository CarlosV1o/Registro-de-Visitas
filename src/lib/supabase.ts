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

export const supabase = configuration.success
  ? createClient(configuration.data.url, configuration.data.key, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export function client() {
  if (!supabase) throw new Error("Configura la URL y la clave publicable de Supabase.");

  return supabase;
}
