<script setup lang="ts">
import DataPagination from "@/components/DataPagination.vue";
import { Card } from "@/components/ui/card";
import AppNotice from "@/components/AppNotice.vue";
import { computed, onUnmounted, ref, watch } from "vue";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { downloadCsv, employeeCsv } from "../../../lib/csv";
import EmployeeImport from "../../../components/EmployeeImport.vue";
import { getEmployees } from "../../../lib/api";
import AppIcon from "../../../components/AppIcon.vue";
import { normalizeSearch } from "../../../lib/reports";
import type { Employee } from "../../../lib/models";
import { cache } from "../../../lib/cache";

const employees = ref<Employee[]>(cache.employees() ?? []);
const error = ref("");
const loading = ref(cache.employees() === undefined);
const search = ref("");
const status = ref("all");
const importOpen = ref(false);
const page = ref(1);
const active = computed(() => employees.value.filter((employee) => employee.active).length);

const visible = computed(() =>
  employees.value
    .filter(
      (employee) =>
        (status.value === "all" || employee.active === (status.value === "active")) &&
        normalizeSearch(
          [
            employee.id,
            employee.nombre,
            employee.tienda,
            employee.plaza,
            employee.region,
            employee.asesor,
            employee.posicion,
          ].join(" "),
        ).includes(normalizeSearch(search.value)),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
);

const pages = computed(() => Math.max(1, Math.ceil(visible.value.length / 25)));
const pageRows = computed(() => visible.value.slice((page.value - 1) * 25, page.value * 25));

watch([search, status], () => {
  page.value = 1;
});

watch(pages, (value) => {
  page.value = Math.min(page.value, value);
});

let mounted = true;

async function load() {
  error.value = "";
  // Keep showing cached rows while refreshing in the background.
  loading.value = cache.employees() === undefined;

  try {
    const result = await getEmployees();
    cache.setEmployees(result);

    if (mounted) employees.value = result;
  } catch {
    if (mounted) error.value = "No pudimos cargar la base de empleados. Vuelve a intentarlo.";
  } finally {
    if (mounted) loading.value = false;
  }
}

onUnmounted(() => {
  mounted = false;
});
</script>
<template>
  <Dialog v-model:open="importOpen">
    <div @vue:mounted="load">
      <div class="page-heading">
        <div>
          <p class="eyebrow">ADMINISTRACIÓN</p>
          <h1>Empleados</h1>
          <p class="muted">
            La base de empleados que pueden registrar su asistencia en tus eventos.
          </p>
        </div>
        <DialogTrigger as-child
          ><Button><AppIcon name="plus" /> Importar CSV</Button></DialogTrigger
        >
      </div>
      <AppNotice v-if="error" kind="error">
        {{ error }} <Button variant="outline" @click="load">Volver a intentar</Button>
      </AppNotice>
      <DialogContent class="employee-import-dialog"
        ><DialogHeader
          ><DialogTitle>Importar empleados</DialogTitle
          ><DialogDescription
            >Selecciona un CSV y revisa los datos antes de guardarlos.</DialogDescription
          ></DialogHeader
        ><EmployeeImport @imported="load"
      /></DialogContent>
      <Card
        class="attendance-panel employee-directory gap-0 rounded-xl border shadow-none ring-0 py-0"
        aria-labelledby="directory-title"
      >
        <div class="section-heading">
          <div>
            <h2 id="directory-title">Directorio de empleados</h2>
            <p class="small muted">
              {{ employees.length }} empleados · {{ active }} activos ·
              {{ employees.length - active }} inactivos
            </p>
          </div>
          <Button
            variant="outline"
            :disabled="loading || !employees.length"
            @click="downloadCsv('empleados.csv', employeeCsv(employees))"
            ><AppIcon name="download" /> Exportar CSV</Button
          >
        </div>
        <div class="filters">
          <InputGroup class="search-field"
            ><InputGroupAddon><AppIcon name="search" /></InputGroupAddon
            ><InputGroupInput
              v-model="search"
              aria-label="Buscar en el directorio"
              type="search"
              placeholder="Buscar ID, nombre, tienda o asesor…"
          /></InputGroup>
          <Select v-model="status"
            ><SelectTrigger aria-label="Estado del empleado"><SelectValue /></SelectTrigger
            ><SelectContent
              ><SelectItem value="all">Todos los empleados</SelectItem
              ><SelectItem value="active">Activos</SelectItem
              ><SelectItem value="inactive">Inactivos</SelectItem></SelectContent
            ></Select
          >
        </div>
        <div v-if="loading" class="grid gap-2 p-4" role="status" aria-label="Cargando empleados">
          <Skeleton v-for="index in 6" :key="index" class="h-10 w-full" />
        </div>
        <div v-else class="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Plaza</TableHead>
                <TableHead>Región</TableHead>
                <TableHead>Asesor</TableHead>
                <TableHead>Posición</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="employee in pageRows" :key="employee.id">
                <TableCell class="id-cell">{{ employee.id }}</TableCell>
                <TableCell class="employee-name">{{ employee.nombre }}</TableCell>
                <TableCell>{{ employee.tienda }}</TableCell>
                <TableCell>{{ employee.plaza }}</TableCell>
                <TableCell>{{ employee.region }}</TableCell>
                <TableCell>{{ employee.asesor }}</TableCell>
                <TableCell>{{ employee.posicion }}</TableCell>
                <TableCell>
                  <Badge :variant="employee.active ? 'secondary' : 'outline'">{{
                    employee.active ? "Activo" : "Inactivo"
                  }}</Badge>
                </TableCell>
              </TableRow>
              <TableRow v-if="!visible.length">
                <TableCell colspan="8" class="empty-state">
                  {{
                    employees.length
                      ? "Sin resultados. Prueba con otros filtros."
                      : "Importa un CSV para comenzar tu directorio."
                  }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div class="table-pagination">
          <span>{{ visible.length }} empleados</span>
          <div>
            <DataPagination v-model:page="page" :total="visible.length" :page-size="25" />
          </div>
        </div>
      </Card>
    </div>
  </Dialog>
</template>
