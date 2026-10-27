<script setup lang="ts">
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AppNotice from "@/components/AppNotice.vue";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ref, watch } from "vue";
import { deleteEvent, updateEvent, setEventImage, eventImageUrl } from "../lib/api";
import { cache } from "../lib/cache";
import type { AttendanceEvent } from "../lib/models";

const props = defineProps<{ event: AttendanceEvent | null }>();
const emit = defineEmits<{ changed: []; deleted: [] }>();
const title = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");
const confirmation = ref<"close" | "delete" | null>(null);

watch(
  () => props.event,
  (event) => {
    title.value = event?.title ?? "";
  },
  { immediate: true },
);

watch(title, () => {
  message.value = "";
});

async function save(close: boolean, rename = true) {
  if (!props.event || busy.value) return;

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    const reopening = !close && !props.event.is_open && !rename;
    await updateEvent(props.event.id, rename ? title.value.trim() : props.event.title, !close);
    confirmation.value = null;
    message.value = rename
      ? "Nombre actualizado."
      : close
        ? "Registro cerrado. La asistencia se conserva y puedes reabrirlo cuando quieras."
        : reopening
          ? "Registro reabierto. El enlace vuelve a aceptar asistencias."
          : "Evento actualizado.";
    cache.clear();
    emit("changed");
  } catch {
    error.value = "No se pudo actualizar el evento. Revisa la conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!props.event || busy.value) return;

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await deleteEvent(props.event.id);
    confirmation.value = null;
    cache.clear();
    emit("deleted");
  } catch {
    error.value = "No se pudo eliminar el evento. Revisa tu conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}

async function changeImage(file: File | null) {
  if (!props.event || busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await setEventImage(props.event, file);
    cache.clear();
    message.value = file ? "Imagen actualizada." : "Imagen eliminada.";
    emit("changed");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "No se pudo actualizar la imagen.";
  } finally {
    busy.value = false;
  }
}

function selectImage(event: Event) {
  const input = event.target;

  if (!(input instanceof HTMLInputElement)) return;

  const file = input.files?.[0];

  if (file) void changeImage(file);
  input.value = "";
}

function requestConfirmation(action: "close" | "delete") {
  error.value = "";
  confirmation.value = action;
}

function confirmAction() {
  if (confirmation.value === "delete") void remove();
  else if (confirmation.value === "close") void save(true, false);
}
</script>

<template>
  <Card class="settings-panel gap-0 rounded-xl border shadow-none ring-0 p-6">
    <h2>Configuración del evento</h2>
    <p class="muted">
      Actualiza el nombre o cierra el registro. El enlace y la asistencia se conservan.
    </p>
    <form v-if="event" @submit.prevent="save(!event.is_open)">
      <Label class="mb-2 block" for="edit-title">Nombre del evento</Label
      ><Input id="edit-title" v-model="title" required maxlength="200" />
      <div class="actions">
        <Button :disabled="busy || !title.trim() || title.trim() === event.title">{{
          busy ? "Guardando…" : "Guardar nombre"
        }}</Button
        ><Button
          variant="outline"
          v-if="event.is_open"
          type="button"
          :disabled="busy"
          @click="requestConfirmation('close')"
        >
          Cerrar evento</Button
        ><Button variant="outline" v-else type="button" :disabled="busy" @click="save(false, false)"
          >Reabrir evento</Button
        >
      </div>
    </form>
    <section v-if="event" class="mt-6 space-y-3" aria-labelledby="event-image-title">
      <h3 id="event-image-title">Imagen del evento</h3>
      <p class="small muted">
        Se usa como fondo de la página de registro. JPG, PNG o WebP, hasta 5 MB.
      </p>
      <img
        v-if="event.image_path"
        :src="eventImageUrl(event.image_path)"
        :alt="event.title"
        class="event-image"
      />
      <Label for="event-image">{{ event.image_path ? "Reemplazar imagen" : "Subir imagen" }}</Label>
      <input
        class="block w-full rounded-lg border p-2 text-sm"
        id="event-image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        :disabled="busy"
        @change="selectImage"
      />
      <p v-if="busy" role="status" class="small muted">Guardando…</p>
      <Button
        v-if="event.image_path"
        variant="outline"
        type="button"
        :disabled="busy"
        @click="changeImage(null)"
        >Quitar imagen</Button
      >
    </section>
    <section v-if="event" class="danger-zone" aria-labelledby="delete-event-title">
      <h3 id="delete-event-title">Eliminar evento</h3>
      <p>
        Se eliminarán este evento y todos sus registros de asistencia. Los empleados y los demás
        eventos se conservan.
      </p>
      <Button
        variant="destructive"
        type="button"
        :disabled="busy"
        @click="requestConfirmation('delete')"
        >Eliminar evento</Button
      >
    </section>
    <AppNotice v-if="error && !confirmation" kind="error">{{ error }}</AppNotice>
    <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
    <AlertDialog
      :open="confirmation !== null"
      @update:open="
        (open) => {
          if (!open && !busy) confirmation = null;
        }
      "
      ><AlertDialogContent
        ><AlertDialogHeader
          ><AlertDialogTitle>{{
            confirmation === "delete" ? "¿Eliminar este evento?" : "¿Cerrar el registro?"
          }}</AlertDialogTitle
          ><AlertDialogDescription>{{
            confirmation === "delete"
              ? `Se eliminará «${event?.title}» y toda su asistencia. Esta acción no se puede deshacer.`
              : `Se cerrará el registro de «${event?.title}». Se conservará la asistencia y podrás reabrirlo después.`
          }}</AlertDialogDescription></AlertDialogHeader
        ><AppNotice v-if="error" kind="error">{{ error }}</AppNotice
        ><AlertDialogFooter
          ><AlertDialogCancel :disabled="busy">Cancelar</AlertDialogCancel
          ><Button
            :variant="confirmation === 'delete' ? 'destructive' : 'default'"
            :disabled="busy"
            @click="confirmAction"
            >{{
              busy ? "Guardando…" : confirmation === "delete" ? "Eliminar evento" : "Cerrar evento"
            }}</Button
          ></AlertDialogFooter
        ></AlertDialogContent
      ></AlertDialog
    >
  </Card>
</template>
