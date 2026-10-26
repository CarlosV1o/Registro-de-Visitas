<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { onMounted, ref } from "vue";
import { navigate } from "vike/client/router";
import { appLink } from "../../lib/links";
import BrandMark from "../../components/BrandMark.vue";

// GitHub Pages serves 404.html for events created after the static build.
// Re-run Vike's client router against the original path; no event data is embedded in HTML.
const path = import.meta.env.SSR
  ? ""
  : window.location.pathname.slice(import.meta.env.BASE_URL.length - 1);

const restoring = ref(
  /^\/(eventos\/[^/]+|admin\/eventos\/[^/]+(?:\/configuracion)?)\/?$/.test(path),
);

onMounted(async () => {
  if (!restoring.value) return;

  try {
    await navigate(window.location.pathname + window.location.search + window.location.hash, {
      overwriteLastHistoryEntry: true,
    });
  } catch {
    restoring.value = false;
  }
});
</script>
<template>
  <main v-if="restoring" class="loading-screen" role="status">Cargando evento…</main>
  <main v-else class="welcome">
    <BrandMark />
    <h1>Página no encontrada</h1>
    <p class="muted">Revisa el enlace de tu evento.</p>
    <Button as-child><a :href="appLink()">Ir al inicio</a></Button>
  </main>
</template>
