<script setup lang="ts">
const props = defineProps<{ name: string }>();

const paths = new Map([
  ["check", "M5 12l4 4L19 6"],
  ["calendar", "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z"],
  ["arrow", "M5 12h14m-6-6 6 6-6 6"],
  ["back", "M19 12H5m6-6-6 6 6 6"],
  ["lock", "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3"],
  [
    "users",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ],
  ["plus", "M12 5v14M5 12h14"],
  [
    "link",
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  ],
  ["download", "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"],
  ["clock", "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  ["settings", "M4 7h16M4 17h16M9 4v6M15 14v6"],
  ["logout", "M9 4H4v16h5m4-12 4 4-4 4m-4-4h13"],
  ["search", "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
]);
</script>
<template>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths.get(props.name)" />
  </svg>
</template>
