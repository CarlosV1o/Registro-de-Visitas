<script setup lang="ts">
import { Skeleton } from "@/components/ui/skeleton";
</script>

<template>
  <div class="admin-app flex" role="status" aria-label="Comprobando acceso">
    <aside class="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar px-5 py-6 md:flex">
      <Skeleton class="h-8 w-36" />
      <div class="grid gap-3"><Skeleton class="h-8 w-full" /><Skeleton class="h-8 w-4/5" /></div>
      <Skeleton class="mt-auto h-10 w-full" />
    </aside>
    <div class="min-w-0 flex-1">
      <div class="admin-topbar"><Skeleton class="h-5 w-48" /></div>
      <div class="admin-workspace grid gap-4">
        <Skeleton class="h-3 w-28" /><Skeleton class="h-8 w-56" /><Skeleton
          class="mb-4 h-4 w-80 max-w-full"
        />
        <Skeleton v-for="index in 4" :key="index" class="h-14 w-full" />
      </div>
    </div>
  </div>
</template>
