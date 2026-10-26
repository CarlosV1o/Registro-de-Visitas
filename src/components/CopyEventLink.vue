<script setup lang="ts">
import AppNotice from "./AppNotice.vue";
import { Button } from "@/components/ui/button";
import { computed, onUnmounted, ref } from "vue";
import { eventLink } from "../lib/links";
import AppIcon from "./AppIcon.vue";

// Compact keeps the label for screen readers but shows only the icon on narrow screens.
const props = defineProps<{ eventId: string; compact?: boolean }>();
const message = ref("");
const url = computed(() => new URL(eventLink(props.eventId), window.location.origin).href);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    message.value = "Enlace copiado";
  } catch {
    message.value = "Abre el registro y copia la dirección del navegador.";
  }

  clearTimeout(timer);
  timer = setTimeout(() => {
    message.value = "";
  }, 5000);
}

onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <div class="copy-event-link">
    <Button variant="ghost" size="sm" class="text-muted-foreground" @click="copy">
      <AppIcon :name="message === 'Enlace copiado' ? 'check' : 'link'" /><span
        :class="{ 'sr-only sm:not-sr-only': compact }"
        >{{ message === "Enlace copiado" ? message : "Copiar enlace" }}</span
      >
    </Button>
    <span v-if="message === 'Enlace copiado'" class="sr-only" role="status">{{ message }}</span>
    <AppNotice v-else-if="message" kind="error">{{ message }}</AppNotice>
  </div>
</template>
