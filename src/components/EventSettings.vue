<script setup lang="ts">
import { ref, watch } from "vue";
import { createEvent, updateEvent } from "../lib/api";
import type { AttendanceEvent } from "../lib/models";

const props = defineProps<{ event: AttendanceEvent | null }>();
const emit = defineEmits<{ changed: [] }>();
const newTitle = ref("");
const title = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");

watch(
  () => props.event,
  (event) => {
    title.value = event?.title ?? "";
  },
  { immediate: true },
);

async function create() {
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await createEvent(newTitle.value.trim());
    newTitle.value = "";
    message.value = "Evento creado. Selecciónalo en la parte superior para registrar ingresos.";
    emit("changed");
  } catch {
    error.value = "No se pudo crear el evento. Revisa la conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}

async function save(close: boolean) {
  if (!props.event) return;

  if (
    close &&
    !window.confirm(
      "¿Cerrar este evento? Se conservará la asistencia y no se permitirán más ingresos.",
    )
  )
    return;

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await updateEvent(props.event.id, title.value.trim(), !close);
    message.value = "Evento actualizado.";
    emit("changed");
  } catch {
    error.value = "No se pudo actualizar el evento. Revisa la conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel settings-panel">
    <h2>Administrar eventos</h2>
    <p class="muted">
      Crea un evento nuevo para empezar con asistencia vacía. El historial de los anteriores se
      conserva.
    </p>
    <form @submit.prevent="create">
      <label for="new-event">Nombre del nuevo evento</label>
      <div class="inline-form">
        <input
          id="new-event"
          v-model="newTitle"
          required
          maxlength="200"
          placeholder="Ej. Reunión de octubre"
        /><button class="primary" :disabled="busy">Crear evento</button>
      </div>
    </form>
    <form v-if="event" class="divider" @submit.prevent="save(!event.is_open)">
      <h3>Evento seleccionado</h3>
      <label for="edit-title">Nombre del evento</label
      ><input id="edit-title" v-model="title" required maxlength="200" />
      <div class="actions">
        <button :disabled="busy">Guardar nombre</button
        ><button
          v-if="event.is_open"
          class="danger"
          type="button"
          :disabled="busy"
          @click="save(true)"
        >
          Cerrar evento</button
        ><button v-else type="button" :disabled="busy" @click="save(false)">Reabrir evento</button>
      </div>
    </form>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <p v-if="message" role="status" class="notice success">{{ message }}</p>
  </section>
</template>
