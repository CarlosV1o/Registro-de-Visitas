<script setup lang="ts">
import { ref, watch } from "vue";
import { deleteEvent, updateEvent } from "../lib/api";
import type { AttendanceEvent } from "../lib/models";

const props = defineProps<{ event: AttendanceEvent | null }>();
const emit = defineEmits<{ changed: []; deleted: [] }>();
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

async function remove() {
  if (!props.event || busy.value) return;

  if (
    !window.confirm(
      `¿Eliminar «${props.event.title}» y toda su asistencia? Esta acción no se puede deshacer.`,
    )
  )
    return;

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await deleteEvent(props.event.id);
    emit("deleted");
  } catch {
    error.value = "No se pudo eliminar el evento. Revisa tu conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel settings-panel">
    <h2>Configuración del evento</h2>
    <p class="muted">
      Actualiza el nombre o cierra el registro. El enlace y la asistencia se conservan.
    </p>
    <form v-if="event" @submit.prevent="save(!event.is_open)">
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
    <section v-if="event" class="danger-zone" aria-labelledby="delete-event-title">
      <h3 id="delete-event-title">Eliminar evento</h3>
      <p>
        Se eliminarán este evento y todos sus registros de asistencia. Los empleados y los demás
        eventos se conservan.
      </p>
      <button class="danger" type="button" :disabled="busy" @click="remove">Eliminar evento</button>
    </section>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <p v-if="message" role="status" class="notice success">{{ message }}</p>
  </section>
</template>
