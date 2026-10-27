import { describe, expect, it } from "vite-plus/test";
import { securityPolicy } from "./security";
import { publicReceiptSchema } from "./api";

describe("browser and public API security", () => {
  it("permits connections only to the configured HTTPS backend origin", () => {
    const policy = securityPolicy("https://project.supabase.co/path");
    expect(policy).toContain("connect-src 'self' https://project.supabase.co;");
    expect(policy).not.toContain("*.supabase.co");
    expect(policy).toContain("img-src 'self' data: blob: https://project.supabase.co;");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
  });

  it("fails closed for missing, malformed or non-HTTPS backend configuration", () => {
    for (const value of [
      undefined,
      "https://bad host",
      "http://project.supabase.co",
      "javascript:alert(1)",
      "https://example.test'; script-src *",
    ]) {
      expect(securityPolicy(value)).toContain("connect-src 'self';");
    }
  });

  it("rejects legacy receipts that expose names, attendance state or timestamps", () => {
    expect(publicReceiptSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(
      publicReceiptSchema.safeParse({ accepted: true, nombre: "Private person" }).success,
    ).toBe(false);
    expect(
      publicReceiptSchema.safeParse({
        created: true,
        nombre: "Private person",
        checked_in_at: "2026-10-26T12:00:00Z",
      }).success,
    ).toBe(false);
    expect(publicReceiptSchema.safeParse({ accepted: false }).success).toBe(false);
  });
});
