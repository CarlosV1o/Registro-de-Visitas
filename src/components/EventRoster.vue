<script setup lang="ts">
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ref, watch } from "vue";
import { clearEventRoster } from "../lib/api";
import EmployeeImport from "./EmployeeImport.vue";

const props = defineProps<{ eventId: string; count: number }>();
const emit = defineEmits<{ changed: [] }>();
const open = defineModel<boolean>("open", { required: true });
const confirming = ref(false);
const busy = ref(false);
const error = ref("");
const message = ref("");

watch(open, (value) => {
  if (!value) return;

  error.value = "";
  message.value = "";
});

async function clear() {
  if (busy.value) return;

  busy.value = true;
  error.value = "";
  message.value = "";

  try {
    await clearEventRoster(props.eventId);
    confirming.value = false;
    message.value = "Lista eliminada. Los pendientes vuelven a calcularse con la base activa.";
    emit("changed");
  } catch {
    error.value = "No se pudo quitar la lista. Revisa tu conexión y tus permisos.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open"
    ><DialogContent class="roster-dialog sm:max-w-xl"
      ><DialogHeader
        ><DialogTitle>Empleados convocados</DialogTitle
        ><DialogDescription>{{
          count
            ? `${count} empleados convocados. Los pendientes y el porcentaje se calculan con esta lista; quien se registre sin estar en ella aparece como «No convocado».`
            : "Sin lista: los pendientes se calculan con todos los empleados activos. Sube el CSV de quienes deben asistir a este evento."
        }}</DialogDescription></DialogHeader
      >
      <EmployeeImport :event-id="eventId" @imported="emit('changed')" />
      <section v-if="count" class="roster-clear">
        <div>
          <h3>Quitar lista</h3>
          <p class="small muted">
            Los empleados y la asistencia se conservan. Los pendientes vuelven a ser la base activa.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          :disabled="busy"
          @click="
            error = '';
            confirming = true;
          "
          >Quitar lista de convocados</Button
        >
      </section>
      <AppNotice v-if="error && !confirming" kind="error">{{ error }}</AppNotice>
      <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
    </DialogContent></Dialog
  >
  <AlertDialog
    :open="confirming"
    @update:open="
      (value) => {
        if (!value && !busy) confirming = false;
      }
    "
    ><AlertDialogContent
      ><AlertDialogHeader
        ><AlertDialogTitle>¿Quitar la lista de convocados?</AlertDialogTitle
        ><AlertDialogDescription
          >Se quitarán los {{ count }} convocados de este evento. Podrás subir otra lista
          después.</AlertDialogDescription
        ></AlertDialogHeader
      ><AppNotice v-if="error" kind="error">{{ error }}</AppNotice
      ><AlertDialogFooter
        ><AlertDialogCancel :disabled="busy">Cancelar</AlertDialogCancel
        ><Button :disabled="busy" @click="clear">{{
          busy ? "Guardando…" : "Quitar lista"
        }}</Button></AlertDialogFooter
      ></AlertDialogContent
    ></AlertDialog
  >
</template>
