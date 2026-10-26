import { randomUUID } from "node:crypto";

const projectUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!projectUrl || !publishableKey?.startsWith("sb_publishable_")) {
  throw new Error(
    "Set the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY repository variables.",
  );
}

const project = new URL(projectUrl);

if (project.protocol !== "https:") throw new Error("The production Supabase URL must use HTTPS.");

// A random nonexistent event cannot create attendance or return employee data.
const response = await fetch(new URL("/rest/v1/rpc/register_attendance", project), {
  method: "POST",
  headers: { apikey: publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    target_event: randomUUID(),
    target_employee: `deployment-probe-${randomUUID()}`,
  }),
  signal: AbortSignal.timeout(15000),
});

const receipt = await response.json();

if (!response.ok || receipt?.accepted !== true || Object.keys(receipt).length !== 1) {
  throw new Error(
    "Production check-in API is not ready. Apply migration 202610260004_public_protection.sql and verify trusted gateway headers before publishing. No backend response or credentials were logged.",
  );
}

console.log("Production check-in API returns the protected receipt.");
