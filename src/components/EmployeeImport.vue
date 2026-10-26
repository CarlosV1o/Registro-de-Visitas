<script setup lang="ts">
import { ref } from "vue";
import { parseEmployees, employeeCsv, downloadCsv, makeCsv, employeeHeaders } from "../lib/csv";
import { importEmployees } from "../lib/api";
import type { Employee } from "../lib/models";

const emit = defineEmits<{ imported: [] }>();

defineProps<{ employees: Employee[] }>();

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
    const count = await importEmployees(pending.value);
    pending.value = [];
    message.value = `${count} empleados importados. Los registros existentes se actualizaron por ID.`;
    emit("imported");
  } catch {
    error.value =
      "No se pudo importar. Verifica tus permisos, tu conexión y los límites del archivo. Ningún cambio de este archivo se guardó.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="import-title">
    <div class="section-heading">
      <div>
        <h2 id="import-title">Base de empleados</h2>
        <p class="muted">{{ employees.length }} registros en la base</p>
      </div>
      <button @click="downloadCsv('empleados.csv', employeeCsv(employees))">
        Exportar empleados
      </button>
    </div>
    <p>
      Descarga tu hoja <strong>Base</strong> como CSV UTF-8. Conserva las columnas ID, Nombre,
      Tienda, Plaza, Región, Asesor y Posición.
    </p>
    <details class="import-help">
      <summary>Requisitos del archivo</summary>
      <p class="small muted">
        ID y Nombre son obligatorios. Los detalles omitidos se guardan vacíos. Los IDs conservan sus
        ceros iniciales. La columna opcional Activo (sí/no) permite desactivar empleados; omitirla
        los activa. Los empleados ausentes del archivo no se eliminan.
      </p>
    </details>
    <div class="actions">
      <label class="button primary file-button"
        >Elegir CSV<input
          ref="input"
          type="file"
          accept=".csv,text/csv"
          :disabled="busy"
          @change="selectFile"
      /></label>
      <button @click="downloadCsv('plantilla-empleados.csv', makeCsv([employeeHeaders]))">
        Descargar plantilla
      </button>
    </div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="message" class="notice success" role="status">{{ message }}</p>
    <div v-if="pending.length" class="import-preview">
      <h3>{{ filename }}</h3>
      <p>
        {{ pending.length }} empleados listos. Revisa las primeras
        {{ Math.min(pending.length, 5) }} filas antes de confirmar.
      </p>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Tienda</th>
              <th>Asesor</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="employee in pending.slice(0, 5)" :key="employee.id">
              <td>{{ employee.id }}</td>
              <td>{{ employee.nombre }}</td>
              <td>{{ employee.tienda || "Sin tienda" }}</td>
              <td>{{ employee.asesor || "Sin asesor" }}</td>
              <td>{{ employee.active ? "Sí" : "No" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="actions">
        <button class="primary" :disabled="busy" @click="save">
          {{ busy ? "Importando…" : `Confirmar ${pending.length} empleados` }}</button
        ><button :disabled="busy" @click="pending = []">Cancelar</button>
      </div>
    </div>
  </section>
</template>
