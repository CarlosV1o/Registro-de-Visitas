<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import EventWorkspace from "../../../../components/EventWorkspace.vue";

const pageContext = usePageContext();
</script>
<template>
  <EventWorkspace :event-id="pageContext.routeParams.eventId ?? ''" />
</template>
