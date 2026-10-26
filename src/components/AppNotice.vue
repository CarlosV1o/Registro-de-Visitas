<script setup lang="ts">
import { CircleAlert, CircleCheck, Info } from "@lucide/vue";
import { Alert, AlertDescription } from "@/components/ui/alert";

withDefaults(defineProps<{ kind?: "error" | "success" | "info" }>(), { kind: "info" });
</script>

<template>
  <Alert
    :variant="kind === 'error' ? 'destructive' : 'default'"
    :role="kind === 'error' ? 'alert' : 'status'"
    class="app-notice"
    :class="{ 'app-notice-success': kind === 'success' }"
  >
    <CircleAlert v-if="kind === 'error'" /><CircleCheck v-else-if="kind === 'success'" /><Info
      v-else
    />
    <AlertDescription><slot /></AlertDescription>
  </Alert>
</template>
