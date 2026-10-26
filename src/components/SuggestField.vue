<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ComboboxInput, type AcceptableValue } from "reka-ui";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { normalizeSearch } from "../lib/reports";

export type Suggestion = { value: string; label: string; detail?: string };

// A free-text field that suggests existing values. Typing anything is still valid, so the
// list stays closed without matches; choosing a suggestion lets the parent decide what to fill.
const props = defineProps<{
  id: string;
  label: string;
  options: Suggestion[];
  maxlength: number;
  required?: boolean;
  wideList?: boolean;
}>();

const model = defineModel<string>({ required: true });
const emit = defineEmits<{ select: [option: Suggestion] }>();
const open = ref(false);

const matches = computed(() => {
  const query = normalizeSearch(model.value);

  return props.options
    .filter(
      (option) =>
        !query ||
        normalizeSearch(`${option.value} ${option.label} ${option.detail ?? ""}`).includes(query),
    )
    .slice(0, 8);
});

// A list hidden for lack of matches is closed, so it does not reappear when the text changes.
watch(
  () => matches.value.length,
  (count) => {
    if (!count) open.value = false;
  },
);

function choose(value: AcceptableValue) {
  const option = props.options.find((entry) => entry.value === value);

  if (option) emit("select", option);
}
</script>

<template>
  <Combobox
    class="suggest-field"
    ignore-filter
    open-on-click
    :open="open && matches.length > 0"
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    @update:model-value="choose"
    @update:open="(value) => (open = value)"
  >
    <Label class="mb-2 block" :for="id">{{ label }}</Label>
    <ComboboxAnchor>
      <ComboboxInput
        :id="id"
        v-model="model"
        data-slot="combobox-input"
        :maxlength="maxlength"
        :required="required"
        class="bg-input/50 border-transparent focus-visible:border-ring focus-visible:ring-ring/30 h-9 rounded-3xl border px-3 py-1 text-base transition-[color,box-shadow,background-color] focus-visible:ring-3 md:text-sm w-full min-w-0 outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </ComboboxAnchor>
    <ComboboxList align="start" :class="wideList ? 'min-w-72' : undefined">
      <ComboboxViewport>
        <ComboboxItem
          v-for="option in matches"
          :key="option.value"
          :value="option.value"
          class="suggest-option"
        >
          <span class="suggest-option-label">{{ option.label }}</span
          ><span v-if="option.detail" class="suggest-option-detail">{{ option.detail }}</span>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
