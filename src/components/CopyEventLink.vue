<script setup lang="ts">
import AppNotice from "./AppNotice.vue";
import { Button } from "@/components/ui/button";
import { computed, onUnmounted, ref } from "vue";
import { eventLink } from "../lib/links";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ eventId: string }>();
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
    <Button variant="outline" class="copy-button" @click="copy">
      <AppIcon :name="message === 'Enlace copiado' ? 'check' : 'link'" />{{
        message === "Enlace copiado" ? message : "Copiar enlace"
      }}
    </Button>
    <span v-if="message === 'Enlace copiado'" class="sr-only" role="status">{{ message }}</span>
    <AppNotice v-else-if="message" kind="error">{{ message }}</AppNotice>
  </div>
</template>
