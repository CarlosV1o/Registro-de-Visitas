<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import AdminGate from "../../../../../components/AdminGate.vue";
import EventWorkspace from "../../../../../components/EventWorkspace.vue";

const pageContext = usePageContext();
</script>
<template>
  <AdminGate
    ><EventWorkspace :event-id="pageContext.routeParams.eventId ?? ''" settings
  /></AdminGate>
</template>
