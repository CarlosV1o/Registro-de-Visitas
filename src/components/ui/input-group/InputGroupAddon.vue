<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import type { InputGroupVariants } from ".";
import { cn } from "cn";
import { inputGroupAddonVariants } from ".";

const props = withDefaults(
  defineProps<{
    align?: InputGroupVariants["align"];
    class?: HTMLAttributes["class"];
  }>(),
  {
    align: "inline-start",
  },
);

function handleInputGroupAddonClick(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest("button")) return;

  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.parentElement?.querySelector("input")?.focus();
}
</script>

<template>
  <div
    role="group"
    data-slot="input-group-addon"
    :data-align="props.align"
    :class="cn(inputGroupAddonVariants({ align: props.align }), props.class)"
    @click="handleInputGroupAddonClick"
  >
    <slot />
  </div>
</template>
