import type { Config } from "vike/types";
import vikeVue from "vike-vue/config";

export default {
  extends: [vikeVue],
  ssr: false,
  // Development uses an inline Vite bootstrap; static production scripts are external.
  csp: { nonce: process.env.NODE_ENV !== "production" },
  prerender: { partial: true },
  title: "Asistencia · Registro de eventos",
  description: "Registra tu asistencia y administra tus eventos.",
  lang: "es",
} satisfies Config;
