<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  Check,
  Clock,
  Download,
  Link,
  LockKeyhole,
  LogOut,
  Plus,
  Ellipsis,
  Upload,
  Printer,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
} from "@lucide/vue";

const props = defineProps<{ name: string }>();

const icons = new Map([
  ["upload", Upload],
  ["more", Ellipsis],
  ["print", Printer],
  ["check", Check],
  ["calendar", CalendarDays],
  ["arrow", ArrowRight],
  ["back", ArrowLeft],
  ["lock", LockKeyhole],
  ["users", Users],
  ["plus", Plus],
  ["link", Link],
  ["download", Download],
  ["clock", Clock],
  ["settings", SlidersHorizontal],
  ["logout", LogOut],
  ["search", Search],
  ["chart", ChartColumn],
  ["chevron", ChevronDown],
  ["attended", UserCheck],
  ["pending", Clock],
]);
</script>
<template>
  <component :is="icons.get(props.name)" :size="20" :stroke-width="1.7" aria-hidden="true" />
</template>
