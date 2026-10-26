import { z } from "zod";

export function securityPolicy(projectUrl: string | undefined) {
  const parsed = z.url().safeParse(projectUrl);

  const origin =
    parsed.success && new URL(parsed.data).protocol === "https:"
      ? new URL(parsed.data).origin
      : null;

  const connections = origin ? `'self' ${origin}` : "'self'";

  return [
    "default-src 'self'",
    "script-src 'self'",
    // Reka positions popovers and dialogs with inline styles; scripts stay external.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connections}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
