<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import { appLink } from "../lib/links";
</script>
<template>
  <a :href="appLink()" class="brand"
    ><span class="brand-symbol"><AppIcon name="check" /></span
    ><span>asistencia<span class="brand-period">.</span></span></a
  >
</template>
