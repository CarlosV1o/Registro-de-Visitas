import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  STATIC_PREVIEW: "1",
  DEPLOY_BASE: "/Registro-de-Visitas/",
  VITE_SUPABASE_URL: "https://attendance-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_only",
};

for (const args of [
  ["run", "build"],
  ["run", "test:e2e"],
]) {
  const result = spawnSync("npm", args, { env, stdio: "inherit" });

  if (result.status !== 0) process.exit(result.status ?? 1);
}
