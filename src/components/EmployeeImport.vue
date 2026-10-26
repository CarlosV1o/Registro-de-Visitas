<script setup lang="ts">
import AppNotice from "@/components/AppNotice.vue";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { parseEmployees, downloadCsv, makeCsv, employeeHeaders } from "../lib/csv";
import { importEmployees, importEventRoster } from "../lib/api";
import type { Employee } from "../lib/models";

// With an event, the file also replaces that event's list of scheduled employees.
const props = defineProps<{ eventId?: string }>();
const emit = defineEmits<{ imported: [] }>();

const pending = ref<Employee[]>([]);
const filename = ref("");
const message = ref("");
const error = ref("");
const busy = ref(false);
const input = ref<HTMLInputElement | null>(null);

async function selectFile() {
  error.value = "";
  message.value = "";
  pending.value = [];
  const file = input.value?.files?.[0];

  if (!file) return;

  filename.value = file.name;

  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("El archivo supera 10 MB.");

    pending.value = parseEmployees(await file.text());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "No se pudo leer el archivo.";
  } finally {
    if (input.value) input.value.value = "";
  }
}

async function save() {
  busy.value = true;
  error.value = "";

  try {
    if (props.eventId) {
      const result = await importEventRoster(props.eventId, pending.value);
      message.value = `${result.scheduled} empleados convocados. ${result.created} nuevos registrados en la base y ${result.updated} actualizados por ID.`;
    } else {
      const count = await importEmployees(pending.value);
      message.value = `${count} empleados importados. Los registros existentes se actualizaron por ID.`;
    }

    pending.value = [];
    emit("imported");
  } catch {
    error.value = props.eventId
      ? "No se pudo guardar la lista. Verifica tus permisos, tu conexión, los límites del archivo y que incluya empleados activos. Ningún cambio de este archivo se guardó."
      : "No se pudo importar. Verifica tus permisos, tu conexión y los límites del archivo. Ningún cambio de este archivo se guardó.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="employee-import-flow" aria-label="Archivo de empleados">
    <div class="import-upload">
      <span class="import-upload-icon"><AppIcon name="upload" /></span>
      <h3>Selecciona tu archivo CSV</h3>
      <p>CSV UTF-8 · Máximo 10 MB y 10,000 empleados</p>
      <input
        ref="input"
        class="hidden-file-input"
        type="file"
        accept=".csv,text/csv"
        :aria-label="eventId ? 'Archivo CSV de convocados' : 'Archivo CSV de empleados'"
        :disabled="busy"
        @change="selectFile"
      /><Button type="button" :disabled="busy" @click="input?.click()"
        ><AppIcon name="plus" />{{ pending.length ? "Cambiar archivo" : "Elegir CSV" }}</Button
      >
    </div>
    <div class="import-template">
      <span class="small muted">¿Primera importación?</span
      ><Button
        variant="link"
        type="button"
        @click="downloadCsv('plantilla-empleados.csv', makeCsv([employeeHeaders]))"
        >Descargar plantilla CSV</Button
      >
    </div>
    <Collapsible class="import-help"
      ><CollapsibleTrigger as-child
        ><Button variant="ghost" class="import-help-trigger"
          >Columnas y requisitos <AppIcon name="chevron" /></Button></CollapsibleTrigger
      ><CollapsibleContent>
        <p class="small muted">
          Conserva el orden: ID, Nombre, Tienda, Plaza, Región, Asesor y Posición. ID y Nombre son
          obligatorios. Los IDs conservan sus ceros iniciales. La columna opcional Activo acepta
          sí/no. Omitirla activa los empleados del archivo. Los empleados ausentes del archivo no se
          eliminan.
        </p>
        <p v-if="eventId" class="small muted">
          Los IDs nuevos se registran en la base y los existentes se actualizan. El archivo
          reemplaza la lista de convocados de este evento; las filas con Activo «no» se actualizan
          pero no se convocan.
        </p>
      </CollapsibleContent></Collapsible
    >
    <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
    <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
    <div v-if="pending.length" class="import-preview">
      <h3>{{ filename }}</h3>
      <p>
        {{ pending.length }} empleados listos. Revisa las primeras
        {{ Math.min(pending.length, 5) }} filas antes de confirmar.
      </p>
      <div class="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Asesor</TableHead>
              <TableHead>Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="employee in pending.slice(0, 5)" :key="employee.id">
              <TableCell>{{ employee.id }}</TableCell>
              <TableCell>{{ employee.nombre }}</TableCell>
              <TableCell>{{ employee.tienda || "Sin tienda" }}</TableCell>
              <TableCell>{{ employee.asesor || "Sin asesor" }}</TableCell>
              <TableCell>{{ employee.active ? "Sí" : "No" }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div class="actions">
        <Button variant="default" :disabled="busy" @click="save">
          {{
            busy
              ? "Importando…"
              : eventId
                ? `Guardar lista de ${pending.length} empleados`
                : `Confirmar ${pending.length} empleados`
          }}</Button
        ><Button variant="outline" :disabled="busy" @click="pending = []">Cancelar</Button>
      </div>
    </div>
  </section>
</template>
