<script setup lang="ts">
import { computed } from "vue";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  employee: { id: string; nombre: string };
  phase: "confirmed" | "duplicate";
  checkedInAt: string;
}>();

const initials = computed(() => {
  const names = props.employee.nombre.trim().split(/\s+/);
  const first = names[0]?.[0] ?? "";
  const last = names.length > 1 ? (names[names.length - 1]?.[0] ?? "") : "";

  return (first + last).toLocaleUpperCase("es");
});
</script>

<template>
  <Card
    class="gap-0 overflow-hidden rounded-2xl border py-0 shadow-none ring-0"
    :aria-label="`Bienvenido ${employee.nombre}`"
    role="status"
  >
    <CardHeader class="gap-5 p-5 sm:p-6"
      ><Badge :variant="phase === 'confirmed' ? 'success' : 'secondary'" class="w-fit"
        ><AppIcon :name="phase === 'confirmed' ? 'check' : 'clock'" class="size-3.5" />{{
          phase === "confirmed" ? "Ingreso confirmado" : "Ingreso previo"
        }}</Badge
      >
      <div class="flex items-center gap-4">
        <Avatar class="size-16 shrink-0 rounded-xl"
          ><AvatarFallback class="rounded-xl bg-muted text-xl font-medium">{{
            initials
          }}</AvatarFallback></Avatar
        >
        <div class="min-w-0">
          <p class="mb-1 text-sm text-muted-foreground">Bienvenido</p>
          <CardTitle
            role="heading"
            aria-level="2"
            class="break-words text-2xl font-semibold leading-tight tracking-tight"
            >{{ employee.nombre }}</CardTitle
          >
        </div>
      </div></CardHeader
    >
    <CardContent class="grid grid-cols-2 gap-4 border-y bg-muted/30 px-5 py-4 sm:px-6"
      ><div>
        <p class="mb-1 text-xs text-muted-foreground">Número de empleado</p>
        <strong class="font-mono text-xl font-medium tracking-wide">{{ employee.id }}</strong>
      </div>
      <div>
        <p class="mb-1 text-xs text-muted-foreground">Hora de ingreso</p>
        <strong class="text-lg font-medium tabular-nums">{{
          new Date(checkedInAt).toLocaleTimeString("es-MX", { timeStyle: "short" })
        }}</strong>
      </div></CardContent
    >
    <CardFooter class="px-5 py-4 text-sm text-muted-foreground sm:px-6">{{
      phase === "duplicate"
        ? "Este empleado ya tenía su ingreso registrado."
        : "Asistencia guardada."
    }}</CardFooter>
  </Card>
</template>
