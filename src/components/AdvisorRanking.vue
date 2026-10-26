<script setup lang="ts">
import { computed } from "vue";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { advisorSummary } from "../lib/reports";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ groups: ReturnType<typeof advisorSummary>; total: number }>();
const emit = defineEmits<{ select: [name: string] }>();
const ranked = computed(() => props.groups.filter((group) => group.count > 0));

// Competition ranking: advisors with equal counts share a position (1, 1, 3…).
const positions = computed(() => {
  const result: number[] = [];

  for (const [index, group] of ranked.value.entries())
    result.push(
      index > 0 && ranked.value[index - 1]?.count === group.count
        ? (result[index - 1] ?? 1)
        : index + 1,
    );

  return result;
});

const maximum = computed(() => Math.max(1, ranked.value[0]?.count ?? 0));

function share(count: number) {
  return props.total ? Math.round((count / props.total) * 100) : 0;
}
</script>

<template>
  <Card
    class="advisor-panel gap-0 rounded-xl border py-0 shadow-none ring-0"
    aria-labelledby="advisor-ranking-title"
  >
    <CardHeader class="gap-2 border-b p-5 sm:p-6"
      ><div class="flex flex-wrap items-center justify-between gap-3">
        <CardTitle
          role="heading"
          aria-level="2"
          id="advisor-ranking-title"
          class="flex items-center gap-2"
          ><AppIcon name="chart" /> Ranking de asistencia por asesor</CardTitle
        ><Badge variant="secondary">{{ total }} {{ total === 1 ? "ingreso" : "ingresos" }}</Badge>
      </div>
      <CardDescription
        >{{ ranked.length }}
        {{ ranked.length === 1 ? "asesor con asistentes" : "asesores con asistentes" }} · Porcentaje
        sobre el total de ingresos del evento.</CardDescription
      ></CardHeader
    >
    <CardContent v-if="ranked.length" class="p-3 sm:p-5"
      ><div class="mb-2 flex items-center justify-between px-3 text-xs text-muted-foreground">
        <span>Asesor</span><span>Asistencias · % del evento</span>
      </div>
      <ol class="m-0 grid max-h-[32rem] list-none gap-2 overflow-y-auto p-1">
        <li v-for="(group, index) in ranked" :key="group.name">
          <Button
            variant="ghost"
            class="h-auto w-full flex-col items-stretch gap-3 whitespace-normal rounded-xl border border-transparent px-3 py-4 text-left"
            :class="{ 'bg-muted/60': positions[index] === 1 }"
            :aria-label="`Posición ${positions[index]}: ${group.name || 'Sin asesor'}, ${group.count} ${group.count === 1 ? 'asistencia' : 'asistencias'}`"
            @click="emit('select', group.name)"
            ><span class="flex items-center gap-3"
              ><Badge
                :variant="positions[index] === 1 ? 'default' : 'secondary'"
                class="h-7 min-w-7 justify-center rounded-lg tabular-nums"
                >{{ positions[index] }}</Badge
              ><span class="min-w-0 flex-1 break-words font-medium">{{
                group.name || "Sin asesor"
              }}</span
              ><strong class="text-2xl font-semibold tabular-nums">{{ group.count }}</strong></span
            ><span class="flex items-center gap-3 pl-10"
              ><Progress
                :model-value="(group.count / maximum) * 100"
                :aria-label="`Asistencias de ${group.name || 'Sin asesor'}`"
                :aria-valuetext="`${group.count} ${group.count === 1 ? 'asistencia' : 'asistencias'}; ${share(group.count)}% del evento`"
                class="h-3 flex-1 rounded-md [&_[data-slot=progress-indicator]]:rounded-md"
                :class="{
                  '[&_[data-slot=progress-indicator]]:bg-primary/65': positions[index] !== 1,
                }"
              /><span class="w-12 text-right text-xs text-muted-foreground tabular-nums"
                >{{ share(group.count) }}%</span
              ></span
            ></Button
          >
        </li>
      </ol></CardContent
    >
    <CardContent v-else class="flex flex-col items-center gap-3 px-6 py-12 text-center"
      ><AppIcon name="chart" class="size-9 text-muted-foreground" /><strong
        >Aún no hay ingresos para comparar</strong
      >
      <p class="m-0 text-sm text-muted-foreground">
        El ranking aparecerá automáticamente cuando se registren asistentes.
      </p></CardContent
    >
    <CardFooter v-if="ranked.length" class="border-t px-5 py-4 text-xs text-muted-foreground"
      >Selecciona un asesor para abrir su lista de asistentes.</CardFooter
    >
  </Card>
</template>
