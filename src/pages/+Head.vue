<script setup lang="ts">
import { appLink } from "../lib/links";

const production = import.meta.env.PROD;
</script>
<template>
  <link rel="icon" type="image/svg+xml" :href="appLink('favicon.svg')" />
  <meta name="referrer" content="no-referrer" />
  <meta
    v-if="production"
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'"
  />
</template>
