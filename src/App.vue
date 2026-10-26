<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { z } from "zod";
import type { Session, Subscription } from "@supabase/supabase-js";
import LoginPanel from "./components/LoginPanel.vue";
import EmployeeImport from "./components/EmployeeImport.vue";
import EventSettings from "./components/EventSettings.vue";
import { client, supabase } from "./lib/supabase";
import { checkIn, getAttendance, getEmployees, getEvents, getRole } from "./lib/api";
import { attendanceCsv, downloadCsv } from "./lib/csv";
import type { Attendance, AttendanceEvent, Employee, Role } from "./lib/models";

const session = ref<Session | null>(null);
const role = ref<Role>(null);
const employees = ref<Employee[]>([]);
const events = ref<AttendanceEvent[]>([]);
const attendance = ref<Attendance[]>([]);
const selectedEvent = ref("");
const tab = ref("register");
const adminTab = ref("employees");
const query = ref("");
const attendanceQuery = ref("");
const advisor = ref("");
const busy = ref(false);
const registering = ref(false);
const exporting = ref(false);
const error = ref("");
const notice = ref("");
const noticeKind = ref("success");
const lastSync = ref<Date | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const backgroundInput = ref<HTMLInputElement | null>(null);
const background = ref("");
let subscription: Subscription | undefined;
let polling: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let ticks = 0;

const currentEvent = computed(
  () => events.value.find((event) => event.id === selectedEvent.value) ?? null,
);

const activeEmployees = computed(() => employees.value.filter((employee) => employee.active));
const presentIds = computed(() => new Set(attendance.value.map((entry) => entry.employee_id)));

const missing = computed(
  () => activeEmployees.value.filter((employee) => !presentIds.value.has(employee.id)).length,
);

const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase("es");

  if (!term) return [];

  return activeEmployees.value
    .filter(
      (employee) =>
        employee.id.toLocaleLowerCase("es").includes(term) ||
        employee.nombre.toLocaleLowerCase("es").includes(term),
    )
    .slice(0, 6);
});

const ranking = computed(() => {
  const counts = new Map<string, number>();

  for (const entry of attendance.value) {
    const name = entry.asesor || "Sin asesor";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
});

const visibleAttendance = computed(() =>
  attendance.value
    .filter((entry) => {
      const term = attendanceQuery.value.trim().toLocaleLowerCase("es");

      return (
        (!advisor.value || (entry.asesor || "Sin asesor") === advisor.value) &&
        (!term || `${entry.employee_id} ${entry.nombre}`.toLocaleLowerCase("es").includes(term))
      );
    })
    .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at)),
);

function dateTime(value: string) {
  return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" });
}

function clearData() {
  generation++;
  session.value = null;
  role.value = null;
  employees.value = [];
  events.value = [];
  attendance.value = [];
  selectedEvent.value = "";
  query.value = "";
  attendanceQuery.value = "";
  advisor.value = "";
  notice.value = "";
  error.value = "";
  lastSync.value = null;
  tab.value = "register";
  busy.value = false;
}

async function signInComplete() {
  const { data } = await client().auth.getSession();
  session.value = data.session;
  await refresh(true);
}

async function refresh(includeEmployees = true) {
  if (!session.value || busy.value) return;

  const request = generation;
  const eventId = selectedEvent.value;
  busy.value = true;

  try {
    const newRole = await getRole();

    if (request !== generation) return;

    role.value = newRole;

    if (!newRole) {
      employees.value = [];
      events.value = [];
      attendance.value = [];
      error.value = "Tu cuenta no tiene acceso. Pide al administrador que te asigne un rol.";
      lastSync.value = null;

      return;
    }

    const newEvents = await getEvents();
    const newEmployees = includeEmployees ? await getEmployees() : employees.value;

    const nextEvent = newEvents.some((event) => event.id === eventId)
      ? eventId
      : (newEvents[0]?.id ?? "");

    const newAttendance = nextEvent ? await getAttendance(nextEvent) : [];

    if (request !== generation || eventId !== selectedEvent.value) return;

    events.value = newEvents;
    employees.value = newEmployees;
    selectedEvent.value = nextEvent;
    attendance.value = newAttendance;
    error.value = "";
    lastSync.value = new Date();
  } catch (cause) {
    if (request === generation) {
      const missingSchema = z
        .object({
          code: z.enum(["PGRST202", "PGRST205", "42P01", "42883"]),
        })
        .safeParse(cause).success;

      error.value = missingSchema
        ? "Falta preparar la base de datos. Pide al administrador que complete la instalación."
        : "No se pudo sincronizar. Revisa la conexión y pulsa Actualizar.";
      lastSync.value = null;
    }
  } finally {
    if (request === generation) busy.value = false;
  }
}

async function changeEvent() {
  generation++;
  busy.value = false;
  attendance.value = [];
  advisor.value = "";
  notice.value = "";
  lastSync.value = null;
  await refresh();
}

async function registerEmployee(employee: Employee) {
  const eventId = selectedEvent.value;
  const request = generation;

  if (!eventId || registering.value || !currentEvent.value?.is_open || !lastSync.value) return;

  registering.value = true;
  notice.value = "";

  try {
    const result = await checkIn(eventId, employee.id);

    if (request !== generation || eventId !== selectedEvent.value) return;

    if (!presentIds.value.has(result.record.employee_id)) attendance.value.push(result.record);

    noticeKind.value = result.created ? "success" : "warning";
    notice.value = result.created
      ? `${result.record.nombre}: ingreso registrado a las ${dateTime(result.record.checked_in_at)}.`
      : `${result.record.nombre} ya ingresó: ${dateTime(result.record.checked_in_at)}.`;
    query.value = "";
    searchInput.value?.focus();
  } catch {
    if (request === generation) {
      noticeKind.value = "error";
      notice.value =
        "No se confirmó el ingreso. Actualiza y vuelve a intentar; un reintento no crea duplicados.";
    }
  } finally {
    registering.value = false;
  }
}

function registerExact() {
  const exact = activeEmployees.value.find(
    (employee) =>
      employee.id.toLocaleLowerCase("es") === query.value.trim().toLocaleLowerCase("es"),
  );

  if (exact) void registerEmployee(exact);
  else {
    noticeKind.value = "warning";
    notice.value = "Selecciona un empleado de los resultados o escribe su ID completo.";
  }
}

async function exportAttendance() {
  const eventId = selectedEvent.value;
  const request = generation;

  if (!eventId || exporting.value) return;

  exporting.value = true;

  try {
    // Always fetch every page rather than exporting a filtered or stale dashboard.
    const records = await getAttendance(eventId);

    if (request !== generation || !session.value) return;

    downloadCsv(
      `asistencia_${eventId}_${new Date().toISOString().slice(0, 10)}.csv`,
      attendanceCsv(records),
    );
  } catch {
    error.value = "No se pudo exportar la asistencia. Revisa tu conexión y vuelve a intentar.";
  } finally {
    exporting.value = false;
  }
}

async function signOut() {
  const result = await client().auth.signOut({ scope: "local" });

  if (result.error) {
    error.value = "No se pudo cerrar sesión. Cierra esta pestaña para borrar la sesión de memoria.";

    return;
  }

  clearData();
}

async function setBackground() {
  const file = backgroundInput.value?.files?.[0];

  if (!file) return;

  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 3 * 1024 * 1024
  ) {
    error.value = "Usa una imagen PNG, JPG o WebP de hasta 3 MB.";

    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const data = reader.result;

    if (data instanceof ArrayBuffer || data === null) return;

    try {
      localStorage.setItem("attendance-background", data);
      background.value = data;
    } catch {
      error.value = "El navegador no pudo guardar el fondo.";
    }
  };

  reader.readAsDataURL(file);
}

function removeBackground() {
  background.value = "";

  try {
    localStorage.removeItem("attendance-background");
  } catch {
    /* Customization is optional when storage is blocked. */
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem("attendance-background");

    if (saved && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(saved))
      background.value = saved;
  } catch {
    /* The app can operate without browser storage. */
  }

  if (supabase) {
    subscription = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearData();
    }).data.subscription;
  }

  polling = setInterval(() => {
    ticks++;

    if (!document.hidden) void refresh(ticks % 4 === 0);
  }, 15000);
});

onUnmounted(() => {
  subscription?.unsubscribe();
  clearInterval(polling);
});
</script>

<template>
  <LoginPanel v-if="!session" @signed-in="signInComplete" />
  <div v-else class="app-shell">
    <header class="app-header">
      <a href="#" class="wordmark" @click.prevent="tab = 'register'">Asistencia</a>
      <nav class="header-actions" aria-label="Navegación principal">
        <button v-if="tab !== 'register'" @click="tab = 'register'">Volver al registro</button>
        <button v-if="role && tab !== 'attendance'" @click="tab = 'attendance'">
          Ver asistencia <span class="count">{{ attendance.length }}</span>
        </button>
        <button v-if="role === 'admin' && tab !== 'admin'" @click="tab = 'admin'">
          Administración
        </button>
        <details class="account-menu">
          <summary>Cuenta</summary>
          <div class="account-popover">
            <p>{{ session.user.email }}</p>
            <button @click="signOut">Cerrar sesión</button>
          </div>
        </details>
      </nav>
    </header>
    <main class="workspace" :class="{ 'register-workspace': tab === 'register' }">
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <template v-if="role">
        <div class="event-toolbar">
          <div class="event-picker">
            <label for="event-select">Evento</label
            ><select
              id="event-select"
              v-model="selectedEvent"
              :disabled="!events.length || registering"
              @change="changeEvent"
            >
              <option v-if="!events.length" value="">Sin eventos</option>
              <option v-for="event in events" :key="event.id" :value="event.id">
                {{ event.title }}{{ event.is_open ? "" : " (cerrado)" }}
              </option>
            </select>
          </div>
          <div class="sync-line">
            <span role="status">{{
              busy ? "Actualizando…" : lastSync ? "Actualizado" : "Sin conexión"
            }}</span
            ><button :disabled="busy" @click="refresh()">Actualizar</button>
          </div>
        </div>
        <p v-if="!currentEvent && !busy" class="notice">
          {{
            role === "admin"
              ? "Para empezar, crea un evento e importa tus empleados en Administración."
              : "Todavía no hay eventos. Pide al administrador que cree uno."
          }}
        </p>
        <section
          v-if="tab === 'register'"
          class="panel checkin-panel"
          :style="
            background
              ? { backgroundImage: `linear-gradient(#fffffff0, #fffffff0), url('${background}')` }
              : undefined
          "
          aria-labelledby="checkin-title"
        >
          <div class="section-heading">
            <h1 id="checkin-title">Registrar asistencia</h1>
            <span v-if="currentEvent && !currentEvent.is_open" class="event-status closed"
              >Evento cerrado</span
            >
          </div>
          <p class="muted">Escribe el número o nombre del empleado.</p>
          <form @submit.prevent="registerExact">
            <label for="employee-search">Número o nombre del empleado</label>
            <div class="search-form">
              <input
                id="employee-search"
                ref="searchInput"
                v-model="query"
                type="search"
                autocomplete="off"
                :disabled="!currentEvent?.is_open || registering || !lastSync"
                placeholder="Ej. 004509 o María"
              /><button
                class="primary"
                :disabled="!query.trim() || registering || !currentEvent?.is_open || !lastSync"
              >
                {{ registering ? "Registrando…" : "Registrar" }}
              </button>
            </div>
          </form>
          <p v-if="query.trim() && !matches.length" class="empty-state">
            No encontramos ese empleado. Revisa el número o el nombre.
          </p>
          <ul v-if="matches.length" class="search-results">
            <li v-for="employee in matches" :key="employee.id">
              <div>
                <strong>{{ employee.nombre }}</strong>
                <p>
                  {{ employee.id
                  }}<template v-if="employee.tienda"> · {{ employee.tienda }}</template>
                </p>
              </div>
              <button
                :disabled="
                  registering || !currentEvent?.is_open || !lastSync || presentIds.has(employee.id)
                "
                @click="registerEmployee(employee)"
              >
                {{ presentIds.has(employee.id) ? "Ya registrado" : "Registrar" }}
              </button>
            </li>
          </ul>
          <p v-if="notice" class="notice" :class="noticeKind" role="status" aria-live="polite">
            {{ notice }}
          </p>
          <p v-else class="checkin-hint">La hora se guarda automáticamente.</p>
        </section>
        <section v-else-if="tab === 'attendance'" aria-labelledby="attendance-title">
          <div class="page-heading">
            <h1 id="attendance-title">Asistencia</h1>
            <button :disabled="!currentEvent || exporting || busy" @click="exportAttendance">
              {{ exporting ? "Exportando…" : "Descargar CSV" }}
            </button>
          </div>
          <dl class="metrics">
            <div>
              <dt>Registrados</dt>
              <dd>{{ attendance.length }}</dd>
            </div>
            <div>
              <dt>Pendientes</dt>
              <dd>{{ missing }}</dd>
            </div>
            <div>
              <dt>Empleados activos</dt>
              <dd>{{ activeEmployees.length }}</dd>
            </div>
          </dl>
          <div class="panel">
            <div class="filters">
              <div>
                <label for="attendance-search">Buscar empleado</label
                ><input
                  id="attendance-search"
                  v-model="attendanceQuery"
                  type="search"
                  placeholder="Número o nombre"
                />
              </div>
              <div>
                <label for="advisor-filter">Asesor</label
                ><select id="advisor-filter" v-model="advisor">
                  <option value="">Todos los asesores</option>
                  <option v-for="[name] in ranking" :key="name">{{ name }}</option>
                </select>
              </div>
            </div>
            <p class="small muted">
              {{ visibleAttendance.length }} de {{ attendance.length }} registros. El CSV incluye
              toda la asistencia del evento.
            </p>
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
                  <tr v-for="entry in visibleAttendance" :key="entry.employee_id">
                    <td class="id-cell">{{ entry.employee_id }}</td>
                    <td>{{ entry.nombre }}</td>
                    <td>{{ entry.tienda }}</td>
                    <td>{{ entry.plaza }}</td>
                    <td>{{ entry.region }}</td>
                    <td>{{ entry.asesor }}</td>
                    <td>{{ entry.posicion }}</td>
                    <td class="time-cell">{{ dateTime(entry.checked_in_at) }}</td>
                  </tr>
                  <tr v-if="!visibleAttendance.length">
                    <td colspan="8" class="empty-state">
                      {{
                        attendance.length
                          ? "No hay registros con estos filtros."
                          : "Todavía no hay asistencia registrada."
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <details v-if="ranking.length" class="advisor-summary">
              <summary>Asistencia por asesor</summary>
              <ul class="advisor-counts">
                <li v-for="[name, count] in ranking" :key="name">
                  <button @click="advisor = name">
                    <span>{{ name }}</span
                    ><strong>{{ count }}</strong>
                  </button>
                </li>
              </ul>
            </details>
          </div>
        </section>
        <section v-else-if="tab === 'admin' && role === 'admin'" aria-labelledby="admin-title">
          <h1 id="admin-title">Administración</h1>
          <nav class="tabs" aria-label="Administración">
            <button
              :class="{ active: adminTab === 'employees' }"
              :aria-current="adminTab === 'employees' ? 'page' : undefined"
              @click="adminTab = 'employees'"
            >
              Empleados</button
            ><button
              :class="{ active: adminTab === 'events' }"
              :aria-current="adminTab === 'events' ? 'page' : undefined"
              @click="adminTab = 'events'"
            >
              Evento
            </button>
          </nav>
          <EmployeeImport
            v-if="adminTab === 'employees'"
            :employees="employees"
            @imported="refresh()"
          />
          <template v-else
            ><EventSettings :event="currentEvent" @changed="refresh()" />
            <details class="panel background-settings">
              <summary>Imagen de fondo</summary>
              <p class="muted small">Solo para este navegador. PNG, JPG o WebP de hasta 3 MB.</p>
              <div class="actions">
                <label class="button file-button"
                  >Elegir imagen<input
                    ref="backgroundInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    @change="setBackground" /></label
                ><button :disabled="!background" @click="removeBackground">Quitar fondo</button>
              </div>
            </details></template
          >
        </section>
      </template>
      <button v-else-if="error" @click="refresh()">Volver a intentar</button>
      <p v-else class="empty-state" role="status">Cargando…</p>
    </main>
  </div>
</template>
