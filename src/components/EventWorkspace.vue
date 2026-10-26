<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { z } from "zod";
import { navigate } from "vike/client/router";
import { getAttendance, getEmployees, getEvent } from "../lib/api";
import { attendanceCsv, downloadCsv } from "../lib/csv";
import type { Attendance, AttendanceEvent } from "../lib/models";
import { appLink, eventLink, reportLink } from "../lib/links";
import AppIcon from "./AppIcon.vue";
import EventSettings from "./EventSettings.vue";
import CopyEventLink from "./CopyEventLink.vue";

const props = defineProps<{ eventId: string; settings?: boolean }>();
const event = ref<AttendanceEvent | null>(null);
const attendance = ref<Attendance[]>([]);
const employeeCount = ref(0);
const loading = ref(true);
const exporting = ref(false);
const error = ref("");
const search = ref("");
const advisor = ref("");
const synced = ref<Date | null>(null);
let generation = 0;
let inFlight = false;

const advisors = computed(() =>
  [...new Set(attendance.value.map((entry) => entry.asesor))].sort((a, b) =>
    a.localeCompare(b, "es"),
  ),
);

const visible = computed(() =>
  attendance.value
    .filter(
      (entry) =>
        (!advisor.value || entry.asesor === advisor.value) &&
        `${entry.employee_id} ${entry.nombre}`
          .toLocaleLowerCase("es")
          .includes(search.value.trim().toLocaleLowerCase("es")),
    )
    .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at)),
);

async function load() {
  if (inFlight) return;
  const request = generation;
  const target = props.eventId;
  inFlight = true;
  loading.value = true;
  error.value = "";

  try {
    if (!z.uuid().safeParse(target).success) return;

    const [selected, entries, employees] = await Promise.all([
      getEvent(target),
      getAttendance(target),
      getEmployees(),
    ]);

    if (request !== generation) return;
    event.value = selected;
    attendance.value = entries;
    employeeCount.value = employees.filter((employee) => employee.active).length;
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
    attendance.value = [];
    search.value = "";
    advisor.value = "";
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
  <a :href="appLink('admin')" class="back-link"><AppIcon name="back" /> Todos los eventos</a>
  <p v-if="error" class="notice error" role="alert">
    {{ error }} <button :disabled="loading" @click="load">Volver a intentar</button>
  </p>
  <p v-if="loading && !event" class="empty-state" role="status">Cargando evento…</p>
  <section v-else-if="!event" class="panel empty-events">
    <h1>Evento no encontrado</h1>
    <p class="muted">Comprueba el enlace o regresa a tus eventos.</p>
  </section>
  <template v-else>
    <div class="page-heading event-page-heading">
      <div>
        <div class="event-title-row">
          <span class="status-pill" :class="{ closed: !event.is_open }"
            ><span />{{ event.is_open ? "Abierto" : "Cerrado" }}</span
          >
        </div>
        <h1>{{ event.title }}</h1>
        <p class="muted">El registro y la asistencia de este evento.</p>
      </div>
      <div class="actions heading-actions">
        <CopyEventLink :event-id="event.id" /><a :href="eventLink(event.id)" class="button primary"
          >Abrir registro <AppIcon name="arrow"
        /></a>
      </div>
    </div>
    <nav class="tabs" aria-label="Secciones del evento">
      <a :href="reportLink(event.id)" :aria-current="!settings ? 'page' : undefined"
        ><AppIcon name="users" /> Asistencia <span class="count">{{ attendance.length }}</span></a
      ><a
        :href="`${reportLink(event.id)}/configuracion`"
        :aria-current="settings ? 'page' : undefined"
        ><AppIcon name="settings" /> Configuración</a
      >
    </nav>
    <EventSettings
      v-if="settings"
      :event="event"
      @changed="load"
      @deleted="navigate(appLink('admin'))"
    />
    <template v-else>
      <div class="report-overview">
        <div>
          <span class="overview-icon"><AppIcon name="users" /></span>
          <div>
            <strong>{{ attendance.length }}</strong
            ><span>Asistencias registradas</span>
          </div>
        </div>
        <div class="overview-total">
          <strong>{{ employeeCount }}</strong
          ><span>Empleados activos en la base</span>
        </div>
        <div class="report-sync">
          <span>{{
            loading
              ? "Actualizando…"
              : synced
                ? `Actualizado a las ${synced.toLocaleTimeString("es-MX", { timeStyle: "short" })}`
                : "Sin actualizar"
          }}</span
          ><button :disabled="loading" @click="load">Actualizar</button>
        </div>
      </div>
      <section class="panel attendance-panel" aria-labelledby="attendance-title">
        <div class="section-heading">
          <div>
            <h2 id="attendance-title">Lista de asistencia</h2>
            <p class="muted small">Los registros pertenecen únicamente a este evento.</p>
          </div>
          <button :disabled="exporting || loading" @click="exportCsv">
            <AppIcon name="download" />{{ exporting ? "Descargando…" : "Descargar CSV" }}
          </button>
        </div>
        <div class="filters">
          <div class="search-field">
            <AppIcon name="search" /><input
              v-model="search"
              aria-label="Buscar empleado"
              type="search"
              placeholder="Buscar por número o nombre"
            />
          </div>
          <select v-model="advisor" aria-label="Filtrar por asesor">
            <option value="">Todos los asesores</option>
            <option v-for="name in advisors" :key="name" :value="name">
              {{ name || "Sin asesor" }}
            </option>
          </select>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre completo</th>
                <th>Tienda</th>
                <th>Plaza</th>
                <th>Región</th>
                <th>Asesor</th>
                <th>Posición</th>
                <th>Hora de ingreso</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in visible" :key="entry.employee_id">
                <td class="id-cell">{{ entry.employee_id }}</td>
                <td class="employee-name">{{ entry.nombre }}</td>
                <td>{{ entry.tienda }}</td>
                <td>{{ entry.plaza }}</td>
                <td>{{ entry.region }}</td>
                <td>{{ entry.asesor }}</td>
                <td>{{ entry.posicion }}</td>
                <td class="time-cell">
                  {{
                    new Date(entry.checked_in_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  }}
                </td>
              </tr>
              <tr v-if="!visible.length">
                <td colspan="8" class="empty-state">
                  <span class="empty-table-icon"><AppIcon name="users" /></span
                  ><strong>{{
                    attendance.length ? "Sin resultados" : "Aún no hay asistencias"
                  }}</strong>
                  <p>
                    {{
                      attendance.length
                        ? "Prueba con otro nombre o asesor."
                        : "Comparte el enlace de registro. Las asistencias aparecerán aquí."
                    }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="table-caption">
          {{ visible.length }} de {{ attendance.length }} registros. La descarga incluye toda la
          asistencia del evento.
        </p>
      </section>
    </template>
  </template>
</template>
