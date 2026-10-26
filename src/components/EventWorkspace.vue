<script setup lang="ts">
import AdvisorRanking from "./AdvisorRanking.vue";
import DataPagination from "@/components/DataPagination.vue";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AppNotice from "@/components/AppNotice.vue";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { z } from "zod";
import { navigate } from "vike/client/router";
import { getAttendance, getEmployees, getEvent, getRoster } from "../lib/api";
import { cache } from "../lib/cache";
import { pendingPrefetch } from "../lib/prefetch";
import { attendanceCsv, downloadCsv, makeCsv } from "../lib/csv";
import { attendanceMetrics } from "../lib/metrics";
import {
  advisorSummary,
  reportRows,
  reportHeaders,
  reportStatus,
  reportValues,
  searchReport,
  sortReport,
  type ReportStatus,
  type ReportSort,
} from "../lib/reports";
import { downloadWorkbook } from "../lib/workbook";
import type { Attendance, AttendanceEvent, Employee } from "../lib/models";
import { appLink, eventLink, reportLink } from "../lib/links";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import AppIcon from "./AppIcon.vue";
import EventSettings from "./EventSettings.vue";
import EventRoster from "./EventRoster.vue";
import ManualCheckIn from "./ManualCheckIn.vue";
import CopyEventLink from "./CopyEventLink.vue";

const props = defineProps<{ eventId: string; settings?: boolean }>();
const event = ref<AttendanceEvent | null>(null);
const attendance = ref<Attendance[]>([]);
const employees = ref<Employee[]>([]);
const roster = ref<string[]>([]);
const loading = ref(true);
const exporting = ref(false);
const error = ref("");
const search = ref("");
const moreFilters = ref(false);
const advisor = ref<string | null>(null);

const activeSection = ref<"attendance" | "ranking">(
  !import.meta.env.SSR && window.location.hash === "#ranking" ? "ranking" : "attendance",
);

const status = ref<ReportStatus>("attended");
const region = ref<string | null>(null);
const plaza = ref<string | null>(null);
const sort = ref<ReportSort>("recent");
const page = ref(1);
const pageSize = ref(25);
const synced = ref<Date | null>(null);

let generation = 0;
let inFlight = false;

const metrics = computed(() => attendanceMetrics(employees.value, attendance.value, roster.value));
const ranking = computed(() => advisorSummary(employees.value, attendance.value, roster.value));
const rows = computed(() => reportRows(employees.value, attendance.value, roster.value));
const scheduled = computed(() => roster.value.length > 0);
const rosterOpen = ref(false);
const attended = computed(() => new Set(attendance.value.map((entry) => entry.employee_id)));

const regions = computed(() =>
  [...new Set(rows.value.map((row) => row.region))].sort((a, b) => a.localeCompare(b, "es")),
);

const plazas = computed(() =>
  [...new Set(rows.value.map((row) => row.plaza))].sort((a, b) => a.localeCompare(b, "es")),
);

const attendanceTable = ref<HTMLElement | null>(null);

function selectSection(event: MouseEvent, section: "attendance" | "ranking") {
  if (
    props.settings ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  activeSection.value = section;
  window.history.replaceState(
    window.history.state,
    "",
    reportLink(props.eventId) + (section === "ranking" ? "#ranking" : ""),
  );
}

async function filterAdvisor(name: string) {
  resetFilters();
  activeSection.value = "attendance";
  window.history.replaceState(window.history.state, "", reportLink(props.eventId));
  advisor.value = name;
  status.value = "attended";
  search.value = "";
  await nextTick();
  attendanceTable.value?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });
}

const visible = computed(() =>
  sortReport(
    rows.value.filter(
      (row) =>
        (status.value === "all" ||
          (status.value === "attended"
            ? row.checked_in_at !== null
            : status.value === "unscheduled"
              ? row.unscheduled
              : row.checked_in_at === null)) &&
        (advisor.value === null || row.asesor.trim() === advisor.value) &&
        (region.value === null || row.region === region.value) &&
        (plaza.value === null || row.plaza === plaza.value) &&
        searchReport(row, search.value),
    ),
    sort.value,
  ),
);

const pages = computed(() => Math.max(1, Math.ceil(visible.value.length / pageSize.value)));

const pageRows = computed(() =>
  visible.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
);

const hasFilters = computed(
  () =>
    search.value !== "" || advisor.value !== null || region.value !== null || plaza.value !== null,
);

watch([search, advisor, region, plaza, status, sort, pageSize], () => {
  page.value = 1;
});

// Removing the roster also removes its tab.
watch(scheduled, (value) => {
  if (!value && status.value === "unscheduled") status.value = "attended";
});

watch(pages, (value) => {
  page.value = Math.min(page.value, value);
});

function resetFilters() {
  search.value = "";
  advisor.value = null;
  region.value = null;
  plaza.value = null;
}

function exportView() {
  downloadCsv(
    `vista_${props.eventId}.csv`,
    makeCsv([reportHeaders, ...visible.value.map(reportValues)]),
  );
}

function printReport() {
  window.print();
}

async function exportExcel() {
  if (!event.value || exporting.value) return;
  exporting.value = true;
  const request = generation;
  // Capture one consistent snapshot before the asynchronous workbook import.
  const selected = event.value;
  const base = [...employees.value];
  const records = [...attendance.value];
  const list = [...roster.value];
  const selection = [...visible.value];

  try {
    await downloadWorkbook(selected, base, records, list, selection);
  } catch {
    if (request === generation)
      error.value = "No se pudo generar el archivo Excel. Vuelve a intentarlo.";
  } finally {
    exporting.value = false;
  }
}

async function load() {
  if (inFlight) return;
  const request = generation;
  const target = props.eventId;
  inFlight = true;
  loading.value = true;
  const warming = event.value ? undefined : pendingPrefetch(target);

  // Opening an event right after hovering it reuses that request instead of starting over.
  if (warming) await warming;

  if (request !== generation) return;
  // Show the last known data for this event immediately; the request below refreshes it.
  const cachedEvent = cache.event(target);
  const cachedAttendance = cache.attendance(target);
  const cachedRoster = cache.roster(target);
  const cachedEmployees = cache.employees();

  if (!event.value && cachedEvent && cachedAttendance && cachedRoster && cachedEmployees) {
    event.value = cachedEvent;
    attendance.value = cachedAttendance;
    roster.value = cachedRoster;
    employees.value = cachedEmployees;
  }

  error.value = "";

  try {
    if (!z.uuid().safeParse(target).success) return;

    const [selected, entries, scheduledIds, employeeRows] = await Promise.all([
      getEvent(target),
      getAttendance(target),
      getRoster(target),
      getEmployees(),
    ]);

    cache.setEvent(target, selected);
    cache.setAttendance(target, entries);
    cache.setRoster(target, scheduledIds);
    cache.setEmployees(employeeRows);

    if (request !== generation) return;
    event.value = selected;
    attendance.value = entries;
    roster.value = scheduledIds;
    employees.value = employeeRows;
    synced.value = new Date();
  } catch {
    if (request === generation) {
      error.value = "No pudimos actualizar la asistencia. Revisa tu conexión y vuelve a intentar.";
      synced.value = null;
    }
  } finally {
    if (request === generation) {
      loading.value = false;
      inFlight = false;
    }
  }
}

async function exportCsv() {
  if (exporting.value || !event.value) return;
  exporting.value = true;
  const request = generation;
  const target = props.eventId;

  try {
    const records = await getAttendance(target);

    if (request === generation) downloadCsv(`asistencia_${target}.csv`, attendanceCsv(records));
  } catch {
    if (request === generation)
      error.value = "No se pudo descargar la asistencia. Vuelve a intentarlo.";
  } finally {
    exporting.value = false;
  }
}

watch(
  () => props.eventId,
  () => {
    generation++;
    inFlight = false;
    event.value = null;
    activeSection.value = window.location.hash === "#ranking" ? "ranking" : "attendance";
    attendance.value = [];
    roster.value = [];
    resetFilters();
    status.value = "attended";
    page.value = 1;
    employees.value = [];
    synced.value = null;
    void load();
  },
  { immediate: true },
);

const polling = setInterval(() => {
  if (!document.hidden && !props.settings) void load();
}, 15000);

onUnmounted(() => {
  generation++;
  clearInterval(polling);
});
</script>
<template>
  <Button variant="ghost" size="sm" as-child class="back-link"
    ><a :href="appLink('admin')"><AppIcon name="back" /> Todos los eventos</a></Button
  >
  <AppNotice v-if="error" kind="error">
    {{ error }}
    <Button variant="outline" :disabled="loading" @click="load">Volver a intentar</Button>
  </AppNotice>
  <div
    v-if="loading && !event"
    class="workspace-skeleton"
    role="status"
    aria-label="Cargando evento"
  >
    <Skeleton class="h-8 w-64" /><Skeleton class="h-5 w-96 max-w-full" />
    <div class="grid grid-cols-3 gap-4">
      <Skeleton v-for="index in 3" :key="index" class="h-28" />
    </div>
    <Skeleton class="h-80" />
  </div>
  <Card
    v-else-if="!event && !error"
    class="empty-events gap-0 rounded-xl border shadow-none ring-0 items-center"
  >
    <span class="hero-icon"><AppIcon name="calendar" /></span>
    <h1>Evento no encontrado</h1>
    <p class="muted">Es posible que se haya eliminado o que el enlace esté incompleto.</p>
    <Button variant="outline" as-child><a :href="appLink('admin')">Ver mis eventos</a></Button>
  </Card>
  <template v-else-if="event">
    <div class="page-heading event-page-heading">
      <div>
        <div class="event-title-row">
          <Badge :variant="event.is_open ? 'success' : 'outline'">{{
            event.is_open ? "Registro abierto" : "Registro cerrado"
          }}</Badge>
        </div>
        <h1>{{ event.title }}</h1>
        <p class="muted">Consulta los ingresos, identifica pendientes y prepara tus reportes.</p>
      </div>
      <div class="actions heading-actions">
        <CopyEventLink :event-id="event.id" /><Button variant="outline" @click="rosterOpen = true"
          ><AppIcon name="upload" />{{
            scheduled ? `Convocados (${roster.length})` : "Subir convocados"
          }}</Button
        ><Button as-child
          ><a :href="eventLink(event.id)">Abrir registro <AppIcon name="arrow" /></a
        ></Button>
      </div>
    </div>
    <div class="event-nav-row">
      <NavigationMenu aria-label="Secciones del evento" class="event-navigation" :viewport="false"
        ><NavigationMenuList class="flex-wrap justify-start"
          ><NavigationMenuItem
            ><NavigationMenuLink
              class="flex-row items-center gap-2"
              as-child
              :active="!settings && activeSection === 'attendance'"
              ><a
                :href="reportLink(event.id)"
                :aria-current="!settings && activeSection === 'attendance' ? 'page' : undefined"
                @click="selectSection($event, 'attendance')"
                ><AppIcon name="users" /> Asistencia
                <Badge variant="secondary">{{ attendance.length }}</Badge></a
              ></NavigationMenuLink
            ></NavigationMenuItem
          ><NavigationMenuItem
            ><NavigationMenuLink
              class="flex-row items-center gap-2"
              as-child
              :active="!settings && activeSection === 'ranking'"
              ><a
                :href="reportLink(event.id) + '#ranking'"
                :aria-current="!settings && activeSection === 'ranking' ? 'page' : undefined"
                @click="selectSection($event, 'ranking')"
                ><AppIcon name="chart" /> Ranking por asesor</a
              ></NavigationMenuLink
            ></NavigationMenuItem
          ><NavigationMenuItem
            ><NavigationMenuLink class="flex-row items-center gap-2" as-child :active="settings"
              ><a
                :href="`${reportLink(event.id)}/configuracion`"
                :aria-current="settings ? 'page' : undefined"
                ><AppIcon name="settings" /> Configuración</a
              ></NavigationMenuLink
            ></NavigationMenuItem
          ></NavigationMenuList
        ></NavigationMenu
      >
      <div v-if="!settings" class="report-sync" aria-live="polite">
        <span>{{
          loading
            ? "Actualizando…"
            : synced
              ? `Actualizado a las ${synced.toLocaleTimeString("es-MX", { timeStyle: "short" })}`
              : "Sin actualizar"
        }}</span
        ><Button
          variant="ghost"
          size="icon-sm"
          aria-label="Actualizar ahora"
          title="Actualizar ahora"
          :disabled="loading"
          @click="load"
          ><AppIcon name="refresh" :class="{ 'animate-spin': loading }"
        /></Button>
      </div>
    </div>
    <EventRoster
      v-model:open="rosterOpen"
      :event-id="event.id"
      :count="roster.length"
      @changed="load"
    />
    <EventSettings
      v-if="settings"
      :event="event"
      @changed="load"
      @deleted="navigate(appLink('admin'))"
    />
    <template v-else>
      <dl class="event-metrics" aria-label="Resumen del evento">
        <Card class="metric-card gap-0 rounded-xl border shadow-none ring-0">
          <dt><AppIcon name="users" /> {{ scheduled ? "Convocados" : "Empleados activos" }}</dt>
          <dd>{{ metrics.total }}</dd>
          <p class="small muted">
            {{ scheduled ? "Lista del evento" : "Base de empleados" }}
          </p>
          <Button variant="link" size="sm" class="metric-action" @click="rosterOpen = true">{{
            scheduled ? "Actualizar lista" : "Subir lista de convocados"
          }}</Button>
        </Card>
        <Card class="metric-card metric-attended gap-0 rounded-xl border shadow-none ring-0">
          <dt><AppIcon name="attended" /> Asistencias registradas</dt>
          <dd>{{ metrics.registered }}</dd>
          <p class="small muted">
            {{
              scheduled
                ? `${metrics.percent}% de los convocados`
                : metrics.total
                  ? `${metrics.percent}% de la base activa`
                  : "Sin empleados activos en la base"
            }}<template v-if="metrics.unscheduled">
              · {{ metrics.unscheduled }} no convocados</template
            >
          </p>
          <Progress
            :model-value="metrics.percent"
            class="metric-progress"
            aria-label="Porcentaje de asistencia"
          />
        </Card>
        <Card class="metric-card gap-0 rounded-xl border shadow-none ring-0">
          <dt><AppIcon name="pending" /> Pendientes</dt>
          <dd>{{ metrics.pending }}</dd>
          <p class="small muted">
            {{ scheduled ? "Convocados sin registro" : "Empleados activos sin registro" }}
          </p>
        </Card>
      </dl>
      <AdvisorRanking
        v-if="activeSection === 'ranking'"
        :groups="ranking"
        :total="metrics.registered"
        @select="filterAdvisor"
      />
      <Card
        v-if="activeSection === 'attendance'"
        class="attendance-panel gap-0 rounded-xl border shadow-none ring-0 py-0"
        aria-labelledby="attendance-title"
      >
        <div ref="attendanceTable" class="section-heading">
          <div>
            <h2 id="attendance-title">Lista de asistencia</h2>
            <p class="muted small">
              Los registros pertenecen únicamente a este evento. Horarios en
              {{ Intl.DateTimeFormat().resolvedOptions().timeZone }}.
            </p>
          </div>
          <div class="report-actions">
            <ManualCheckIn
              :event-id="event.id"
              :is-open="event.is_open"
              :scheduled="scheduled"
              :employees="employees"
              :attended="attended"
              @registered="load"
            />
            <Button :disabled="exporting || !synced" @click="exportExcel"
              ><AppIcon name="download" />{{ exporting ? "Exportando…" : "Exportar Excel" }}</Button
            ><DropdownMenu
              ><DropdownMenuTrigger as-child
                ><Button variant="outline" :disabled="!synced" aria-label="Más opciones de reporte"
                  ><AppIcon name="more" /></Button></DropdownMenuTrigger
              ><DropdownMenuContent align="end"
                ><DropdownMenuItem :disabled="exporting" @select="exportCsv"
                  ><AppIcon name="download" /> Descargar CSV completo</DropdownMenuItem
                ><DropdownMenuItem :disabled="!visible.length" @select="exportView"
                  ><AppIcon name="download" /> Descargar vista CSV</DropdownMenuItem
                ><DropdownMenuSeparator /><DropdownMenuItem @select="printReport"
                  ><AppIcon name="print" /> Imprimir vista</DropdownMenuItem
                ></DropdownMenuContent
              ></DropdownMenu
            >
          </div>
        </div>
        <Tabs
          :model-value="status"
          @update:model-value="
            (value) => {
              if (
                value === 'all' ||
                value === 'pending' ||
                value === 'attended' ||
                value === 'unscheduled'
              )
                status = value;
            }
          "
          class="report-tabs-root"
          ><div class="report-tabs">
            <TabsList
              ><TabsTrigger value="attended"
                >Asistencias
                <Badge variant="secondary">{{ metrics.registered }}</Badge></TabsTrigger
              ><TabsTrigger value="pending"
                >Pendientes <Badge variant="secondary">{{ metrics.pending }}</Badge></TabsTrigger
              ><TabsTrigger v-if="scheduled" value="unscheduled"
                >No convocados
                <Badge variant="secondary">{{ metrics.unscheduled }}</Badge></TabsTrigger
              ><TabsTrigger value="all"
                >Todos <Badge variant="secondary">{{ rows.length }}</Badge></TabsTrigger
              ></TabsList
            >
          </div>
          <TabsContent :value="status" class="report-tab-content">
            <div class="filters report-filters">
              <InputGroup class="search-field"
                ><InputGroupAddon><AppIcon name="search" /></InputGroupAddon
                ><InputGroupInput
                  v-model="search"
                  aria-label="Buscar empleado"
                  type="search"
                  placeholder="Buscar empleado, tienda, posición…"
              /></InputGroup>
              <Select
                :model-value="advisor === null ? 'all' : 'value:' + advisor"
                @update:model-value="
                  (value) => {
                    advisor = value === 'all' ? null : String(value).slice(6);
                  }
                "
                ><SelectTrigger aria-label="Filtrar por asesor"><SelectValue /></SelectTrigger
                ><SelectContent
                  ><SelectItem value="all">Todos los asesores</SelectItem
                  ><SelectItem
                    v-for="group in ranking"
                    :key="group.name"
                    :value="'value:' + group.name"
                    >{{ group.name || "Sin asesor" }}</SelectItem
                  ></SelectContent
                ></Select
              >
              <Button
                variant="outline"
                :aria-expanded="moreFilters"
                @click="moreFilters = !moreFilters"
                ><AppIcon name="settings" /> Filtros<span
                  v-if="region !== null || plaza !== null"
                  class="filter-indicator"
              /></Button>
            </div>
            <Collapsible v-model:open="moreFilters"
              ><CollapsibleContent class="extra-filters">
                <Select
                  :model-value="region === null ? 'all' : 'value:' + region"
                  @update:model-value="
                    (value) => {
                      region = value === 'all' ? null : String(value).slice(6);
                    }
                  "
                  ><SelectTrigger aria-label="Filtrar por región"><SelectValue /></SelectTrigger
                  ><SelectContent
                    ><SelectItem value="all">Todas las regiones</SelectItem
                    ><SelectItem v-for="name in regions" :key="name" :value="'value:' + name">{{
                      name || "Sin región"
                    }}</SelectItem></SelectContent
                  ></Select
                >
                <Select
                  :model-value="plaza === null ? 'all' : 'value:' + plaza"
                  @update:model-value="
                    (value) => {
                      plaza = value === 'all' ? null : String(value).slice(6);
                    }
                  "
                  ><SelectTrigger aria-label="Filtrar por plaza"><SelectValue /></SelectTrigger
                  ><SelectContent
                    ><SelectItem value="all">Todas las plazas</SelectItem
                    ><SelectItem v-for="name in plazas" :key="name" :value="'value:' + name">{{
                      name || "Sin plaza"
                    }}</SelectItem></SelectContent
                  ></Select
                >
                <Select
                  :model-value="sort"
                  @update:model-value="
                    (value) => {
                      if (value === 'recent' || value === 'name' || value === 'id') sort = value;
                    }
                  "
                  ><SelectTrigger aria-label="Ordenar registros"><SelectValue /></SelectTrigger
                  ><SelectContent
                    ><SelectItem value="recent">Más recientes</SelectItem
                    ><SelectItem value="name">Nombre A–Z</SelectItem
                    ><SelectItem value="id">Número de empleado</SelectItem></SelectContent
                  ></Select
                ></CollapsibleContent
              ></Collapsible
            >
            <div v-if="hasFilters" class="active-filter">
              <span
                >{{ visible.length }} resultados<span v-if="advisor !== null">
                  · Asesor: <strong>{{ advisor || "Sin asesor" }}</strong></span
                ></span
              ><Button variant="outline" size="sm" @click="resetFilters">Quitar filtros</Button>
            </div>
            <div class="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nombre completo</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Plaza</TableHead>
                    <TableHead>Región</TableHead>
                    <TableHead>Asesor</TableHead>
                    <TableHead>Posición</TableHead>
                    <TableHead>Hora de ingreso</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="entry in pageRows" :key="entry.id">
                    <TableCell class="id-cell">{{ entry.id }}</TableCell>
                    <TableCell class="employee-name">{{ entry.nombre }}</TableCell>
                    <TableCell>{{ entry.tienda }}</TableCell>
                    <TableCell>{{ entry.plaza }}</TableCell>
                    <TableCell>{{ entry.region }}</TableCell>
                    <TableCell>{{ entry.asesor }}</TableCell>
                    <TableCell>{{ entry.posicion }}</TableCell>
                    <TableCell class="time-cell">
                      {{
                        entry.checked_in_at
                          ? new Date(entry.checked_in_at).toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"
                      }}
                    </TableCell>
                    <TableCell>
                      <Badge
                        :variant="
                          entry.unscheduled
                            ? 'secondary'
                            : entry.checked_in_at
                              ? 'success'
                              : 'outline'
                        "
                        ><AppIcon :name="entry.checked_in_at ? 'check' : 'pending'" />{{
                          reportStatus(entry)
                        }}</Badge
                      >
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="!visible.length">
                    <TableCell colspan="9" class="empty-state">
                      <span class="empty-table-icon"><AppIcon name="users" /></span
                      ><strong>{{
                        hasFilters
                          ? "Sin resultados"
                          : status === "pending"
                            ? "No hay empleados pendientes"
                            : status === "unscheduled"
                              ? "Todos los asistentes están convocados"
                              : status === "all"
                                ? "No hay empleados"
                                : "Aún no hay asistencias"
                      }}</strong>
                      <p>
                        {{
                          hasFilters
                            ? "Prueba con otros filtros."
                            : status === "pending"
                              ? scheduled
                                ? "Todos los convocados tienen asistencia registrada."
                                : "Todos los empleados activos tienen asistencia registrada."
                              : status === "unscheduled"
                                ? "Aquí aparecerán quienes se registren sin estar en la lista."
                                : "Comparte el enlace de registro. Las asistencias aparecerán aquí."
                        }}
                      </p>
                      <div v-if="hasFilters" class="mt-4 flex justify-center">
                        <Button variant="outline" size="sm" @click="resetFilters"
                          >Quitar filtros</Button
                        >
                      </div>
                      <div
                        v-else-if="
                          status !== 'pending' && status !== 'unscheduled' && !attendance.length
                        "
                        class="mt-4 flex justify-center"
                      >
                        <CopyEventLink :event-id="event.id" />
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div class="table-pagination">
              <span
                >{{ visible.length }} {{ visible.length === 1 ? "registro" : "registros"
                }}<span v-if="visible.length">
                  · {{ (page - 1) * pageSize + 1 }}–{{
                    Math.min(page * pageSize, visible.length)
                  }}</span
                ></span
              >
              <div>
                <Label class="mb-2 block" for="report-page-size">Filas</Label
                ><Select
                  :model-value="String(pageSize)"
                  @update:model-value="
                    (value) => {
                      pageSize = Number(value);
                    }
                  "
                  ><SelectTrigger id="report-page-size" aria-label="Filas por página"
                    ><SelectValue /></SelectTrigger
                  ><SelectContent
                    ><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem
                    ><SelectItem value="100">100</SelectItem></SelectContent
                  ></Select
                ><DataPagination
                  v-model:page="page"
                  :total="visible.length"
                  :page-size="pageSize"
                />
              </div>
            </div>
            <p class="small muted report-footnote">
              {{
                scheduled
                  ? "Los pendientes se calculan con la lista de convocados del evento"
                  : "Los pendientes se calculan con la base activa actual"
              }}; los datos de asistentes conservan la información del momento de registro.
            </p>
            <p class="print-meta">
              {{ event.title }} ·
              {{
                status === "pending"
                  ? "Pendientes"
                  : status === "unscheduled"
                    ? "No convocados"
                    : status === "attended"
                      ? "Asistencias"
                      : "Todos los empleados"
              }}
              · {{ visible.length }} registros<br />{{ synced?.toLocaleString("es-MX")
              }}<span v-if="search"> · Búsqueda: {{ search }}</span
              ><span v-if="advisor !== null"> · Asesor: {{ advisor || "Sin asesor" }}</span
              ><span v-if="region !== null"> · Región: {{ region || "Sin región" }}</span
              ><span v-if="plaza !== null"> · Plaza: {{ plaza || "Sin plaza" }}</span
              ><br />Hora_Registro: ISO 8601 con zona horaria.
            </p>
            <table class="print-table">
              <thead>
                <tr>
                  <th v-for="header in reportHeaders" :key="header">{{ header }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visible" :key="row.id">
                  <td v-for="(cell, index) in reportValues(row)" :key="index">{{ cell }}</td>
                </tr>
              </tbody>
            </table></TabsContent
          ></Tabs
        >
      </Card>
    </template>
  </template>
</template>
