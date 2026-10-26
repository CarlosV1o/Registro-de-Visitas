<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import AdminGate from "../../../components/AdminGate.vue";
import EmployeeImport from "../../../components/EmployeeImport.vue";
import { getEmployees } from "../../../lib/api";
import type { Employee } from "../../../lib/models";

const employees = ref<Employee[]>([]);
const error = ref("");
let mounted = true;

async function load() {
  error.value = "";

  try {
    const result = await getEmployees();

    if (mounted) employees.value = result;
  } catch {
    if (mounted) error.value = "No pudimos cargar la base de empleados. Vuelve a intentarlo.";
  }
}

onUnmounted(() => {
  mounted = false;
});
</script>
<template>
  <AdminGate
    ><div @vue:mounted="load">
      <div class="page-heading">
        <div>
          <p class="eyebrow">ADMINISTRACIÓN</p>
          <h1>Empleados</h1>
          <p class="muted">
            La base de empleados que pueden registrar su asistencia en tus eventos.
          </p>
        </div>
      </div>
      <p v-if="error" class="notice error" role="alert">
        {{ error }} <button @click="load">Volver a intentar</button>
      </p>
      <EmployeeImport :employees="employees" @imported="load" /></div
  ></AdminGate>
</template>
