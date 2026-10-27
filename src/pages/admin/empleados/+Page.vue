<script setup lang="ts">
import DataPagination from "@/components/DataPagination.vue";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
import { clearEmployees, getEmployees } from "../../../lib/api";
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
const clearOpen = ref(false);
const clearing = ref(false);
const clearError = ref("");
const message = ref("");

async function removeEmployees() {
  if (clearing.value) return;
  clearing.value = true;
  clearError.value = "";
  message.value = "";

  try {
    await clearEmployees();
    cache.clear();
    cache.setEmployees([]);
    employees.value = [];
    clearFilters();
    error.value = "";
    clearOpen.value = false;
    message.value = "Se borraron los empleados, las asistencias y las listas de convocados.";
  } catch {
    clearError.value = "No se pudieron borrar los datos. Revisa la conexión y tus permisos.";
  } finally {
    clearing.value = false;
  }
}

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

const filtered = computed(() => search.value.trim() !== "" || status.value !== "all");

function clearFilters() {
  search.value = "";
  status.value = "all";
}

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
    const request = cache.generation();
    const result = await getEmployees();

    if (request !== cache.generation()) return;
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
        <div class="actions">
          <Button
            variant="destructive"
            :disabled="loading || clearing || !employees.length"
            @click="
              clearError = '';
              clearOpen = true;
            "
            >Borrar todos los empleados</Button
          >
          <DialogTrigger as-child
            ><Button :disabled="clearing"
              ><AppIcon name="upload" /> Importar CSV</Button
            ></DialogTrigger
          >
        </div>
      </div>
      <AppNotice v-if="error" kind="error">
        {{ error }}
        <Button variant="outline" size="sm" :disabled="loading" @click="load"
          >Volver a intentar</Button
        >
      </AppNotice>
      <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
      <AlertDialog
        :open="clearOpen"
        @update:open="
          (open) => {
            if (!clearing) clearOpen = open;
          }
        "
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar todos los datos de empleados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán todos los empleados, incluidos los que no aparecen por los filtros, todas
              las asistencias y las listas de convocados de todos los eventos. Los eventos y sus
              imágenes se conservarán. Esta acción no se puede deshacer. Exporta los datos que
              necesites antes de continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AppNotice v-if="clearError" kind="error">{{ clearError }}</AppNotice>
          <AlertDialogFooter>
            <AlertDialogCancel :disabled="clearing">Cancelar</AlertDialogCancel>
            <Button variant="destructive" :disabled="clearing" @click="removeEmployees">
              {{ clearing ? "Borrando…" : "Borrar todos los datos" }}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <TableRow v-if="!visible.length && (filtered || !error)">
                <TableCell colspan="8" class="empty-state">
                  <span class="empty-table-icon"><AppIcon name="users" /></span
                  ><strong>{{
                    filtered ? "Ningún empleado coincide" : "Tu directorio está vacío"
                  }}</strong>
                  <p>
                    {{
                      filtered
                        ? "Prueba con otro ID, nombre o estado."
                        : "Importa un CSV con tus empleados para que puedan registrar su asistencia."
                    }}
                  </p>
                  <Button
                    v-if="filtered"
                    variant="outline"
                    size="sm"
                    class="mt-4"
                    @click="clearFilters"
                    >Quitar filtros</Button
                  ><Button v-else size="sm" class="mt-4" @click="importOpen = true"
                    ><AppIcon name="upload" /> Importar CSV</Button
                  >
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div class="table-pagination">
          <span>{{ visible.length }} {{ visible.length === 1 ? "empleado" : "empleados" }}</span>
          <div>
            <DataPagination v-model:page="page" :total="visible.length" :page-size="25" />
          </div>
        </div>
      </Card>
    </div>
  </Dialog>
</template>
