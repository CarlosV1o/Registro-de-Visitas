<script setup lang="ts">
import { computed } from "vue";
import {
  Pagination,
  PaginationContent,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ page: number; total: number; pageSize: number }>();
const emit = defineEmits<{ "update:page": [page: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<template>
  <Pagination
    aria-label="Paginación"
    :page="page"
    :total="total"
    :items-per-page="pageSize"
    class="mx-0 w-auto"
    @update:page="emit('update:page', $event)"
    ><PaginationContent
      ><PaginationPrevious size="icon-sm" aria-label="Página anterior" :disabled="page <= 1"
        ><AppIcon name="back" /></PaginationPrevious
      ><span class="pagination-position">{{ page }} / {{ pages }}</span
      ><PaginationNext size="icon-sm" aria-label="Página siguiente" :disabled="page >= pages"
        ><AppIcon name="arrow" /></PaginationNext></PaginationContent
  ></Pagination>
</template>
