<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { z } from "zod";
import { createEvent, getEvents } from "../../../lib/api";
import type { AttendanceEvent } from "../../../lib/models";
import { appLink, eventLink, reportLink } from "../../../lib/links";
import AdminGate from "../../../components/AdminGate.vue";
import AppIcon from "../../../components/AppIcon.vue";
import CopyEventLink from "../../../components/CopyEventLink.vue";

const events = ref<AttendanceEvent[]>([]);
const loading = ref(true);
const creating = ref(false);
const showCreate = ref(false);
const title = ref("");
const search = ref("");
const error = ref("");
const message = ref("");
let mounted = true;

const visible = computed(() =>
  events.value.filter((event) =>
    event.title.toLocaleLowerCase("es").includes(search.value.trim().toLocaleLowerCase("es")),
  ),
);

const opened = computed(() => events.value.filter((event) => event.is_open).length);

async function load() {
  loading.value = true;
  error.value = "";

  try {
    const result = await getEvents();

    if (mounted) events.value = result;
  } catch (cause) {
    if (!mounted) return;

    const missingSchema = z
      .object({ code: z.enum(["PGRST202", "PGRST205", "42P01", "42883"]) })
      .safeParse(cause).success;

    error.value = missingSchema
      ? "Falta preparar la base de datos. Pide al administrador que complete la instalación."
      : "No pudimos cargar tus eventos. Revisa tu conexión y vuelve a intentar.";
  } finally {
    if (mounted) loading.value = false;
  }
}

async function create() {
  if (!title.value.trim() || creating.value) return;
  creating.value = true;
  error.value = "";
  message.value = "";

  try {
    const event = await createEvent(title.value.trim());

    if (!mounted) return;
    events.value.unshift(event);
    title.value = "";
    showCreate.value = false;
    message.value = "Evento creado. Copia su enlace para compartir el registro.";
  } catch {
    if (mounted)
      error.value = "No se pudo crear el evento. Revisa tu conexión y vuelve a intentar.";
  } finally {
    creating.value = false;
  }
}

onUnmounted(() => {
  mounted = false;
});
</script>
<template>
  <AdminGate
    ><div class="admin-content" @vue:mounted="load">
      <div class="page-heading">
        <div>
          <p class="eyebrow">ADMINISTRACIÓN</p>
          <h1>Mis eventos</h1>
          <p class="muted">Crea un evento o consulta su asistencia.</p>
        </div>
        <button class="primary" :aria-expanded="showCreate" @click="showCreate = !showCreate">
          <AppIcon name="plus" /> Nuevo evento
        </button>
      </div>
      <form v-if="showCreate" class="panel create-event-form" @submit.prevent="create">
        <h2>Crea un evento</h2>
        <label for="new-event">Nombre del evento</label>
        <div class="inline-form">
          <input
            id="new-event"
            v-model="title"
            placeholder="Ej. Reunión de noviembre"
            maxlength="200"
            required
            :disabled="creating"
            autofocus
          /><button class="primary" :disabled="creating || !title.trim()">
            {{ creating ? "Creando…" : "Crear evento" }}</button
          ><button type="button" :disabled="creating" @click="showCreate = false">Cancelar</button>
        </div>
        <p class="small muted">Se creará un enlace propio y una lista de asistencia vacía.</p>
      </form>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-if="message" class="notice success" role="status">{{ message }}</p>
      <div class="event-list-toolbar">
        <p>
          <strong>{{ events.length }}</strong> eventos <span class="toolbar-dot">·</span>
          {{ opened }} abiertos
        </p>
        <div class="search-field">
          <AppIcon name="search" /><input
            v-model="search"
            aria-label="Buscar evento"
            type="search"
            placeholder="Buscar evento"
          />
        </div>
      </div>
      <p v-if="loading" class="empty-state" role="status">Cargando tus eventos…</p>
      <div v-else-if="visible.length" class="event-grid">
        <article v-for="event in visible" :key="event.id" class="event-card">
          <div class="event-card-top">
            <span class="event-icon"><AppIcon name="calendar" /></span
            ><span class="status-pill" :class="{ closed: !event.is_open }"
              ><span />{{ event.is_open ? "Abierto" : "Cerrado" }}</span
            >
          </div>
          <h2>
            <a :href="reportLink(event.id)">{{ event.title }}</a>
          </h2>
          <p class="small muted">
            Creado el
            {{
              new Date(event.created_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            }}
          </p>
          <a :href="eventLink(event.id)" class="event-register-link"
            >Abrir registro <AppIcon name="arrow"
          /></a>
          <div class="event-card-bottom">
            <CopyEventLink :event-id="event.id" /><a
              :href="reportLink(event.id)"
              class="button small-button"
              >Ver asistencia</a
            >
          </div>
        </article>
      </div>
      <section v-else class="panel empty-events">
        <span class="hero-icon"><AppIcon name="calendar" /></span>
        <h2>{{ search ? "No encontramos ese evento" : "No hay eventos" }}</h2>
        <p class="muted">
          {{
            search
              ? "Prueba con otro nombre."
              : "Crea un evento y comparte su enlace para comenzar a registrar asistencia."
          }}
        </p>
        <button v-if="!search" class="primary" @click="showCreate = true">
          <AppIcon name="plus" /> Crear evento
        </button>
      </section>
      <div class="admin-tip">
        <AppIcon name="users" />
        <p>
          Prepara tu base de empleados antes de compartir un evento.
          <a :href="appLink('admin/empleados')"
            >Administrar empleados <span aria-hidden="true">→</span></a
          >
        </p>
        <button v-if="error" @click="load">Volver a intentar</button>
      </div>
    </div></AdminGate
  >
</template>
