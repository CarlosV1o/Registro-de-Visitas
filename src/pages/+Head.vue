<script setup lang="ts">
import { securityPolicy } from "../lib/security";
import { appLink } from "../lib/links";

const production = import.meta.env.PROD;
const policy = securityPolicy(import.meta.env.VITE_SUPABASE_URL);
</script>
<template>
  <link rel="icon" type="image/svg+xml" :href="appLink('favicon.svg')" />
  <meta name="referrer" content="no-referrer" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <meta v-if="production" http-equiv="Content-Security-Policy" :content="policy" />
</template>
