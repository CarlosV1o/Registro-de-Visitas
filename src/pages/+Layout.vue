<script setup lang="ts">
import "../style.css";

const embedded = !import.meta.env.SSR && window.self !== window.top;
</script>

<template>
  <main v-if="embedded" class="loading-screen">Abre esta página directamente para continuar.</main>
  <slot v-else />
</template>
