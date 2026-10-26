<script setup lang="ts">
import { Label } from "@/components/ui/label";
import AppNotice from "@/components/AppNotice.vue";
import { computed, onUnmounted, ref } from "vue";
import { z } from "zod";
import { createEvent, getEvents } from "../../../lib/api";
import type { AttendanceEvent } from "../../../lib/models";
import { reportLink } from "../../../lib/links";
import { cache } from "../../../lib/cache";
import { prefetchEvent } from "../../../lib/prefetch";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
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
import AppIcon from "../../../components/AppIcon.vue";
import CopyEventLink from "../../../components/CopyEventLink.vue";

const events = ref<AttendanceEvent[]>(cache.events() ?? []);
const loading = ref(cache.events() === undefined);
const creating = ref(false);
const showCreate = ref(false);
const title = ref("");
const search = ref("");
const eventStatus = ref("all");
const error = ref("");
const loadError = ref("");
const message = ref("");
let mounted = true;

const visible = computed(() =>
  events.value.filter(
    (event) =>
      event.title.toLocaleLowerCase("es").includes(search.value.trim().toLocaleLowerCase("es")) &&
      (eventStatus.value === "all" || event.is_open === (eventStatus.value === "open")),
  ),
);

const opened = computed(() => events.value.filter((event) => event.is_open).length);
const filtered = computed(() => search.value.trim() !== "" || eventStatus.value !== "all");

function clearFilters() {
  search.value = "";
  eventStatus.value = "all";
}

function createdOn(value: string) {
  return new Date(value).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function load() {
  // Keep showing cached events while refreshing in the background.
  loading.value = cache.events() === undefined;
  loadError.value = "";

  try {
    const result = await getEvents();
    cache.setEvents(result);

    if (mounted) events.value = result;
  } catch (cause) {
    if (!mounted) return;

    const missingSchema = z
      .object({ code: z.enum(["PGRST202", "PGRST205", "42P01", "42883"]) })
      .safeParse(cause).success;

    loadError.value = missingSchema
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
    cache.setEvents(events.value);
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
  <Dialog v-model:open="showCreate">
    <div class="admin-content" @vue:mounted="load">
      <div class="page-heading">
        <div>
          <p class="eyebrow">ADMINISTRACIÓN</p>
          <h1>Mis eventos</h1>
          <p class="muted">Crea un evento o consulta su asistencia.</p>
        </div>
        <DialogTrigger as-child
          ><Button><AppIcon name="plus" /> Nuevo evento</Button></DialogTrigger
        >
      </div>
      <DialogContent
        ><DialogHeader
          ><DialogTitle>Crear evento</DialogTitle
          ><DialogDescription
            >Asigna un nombre. Después podrás compartir el enlace de registro.</DialogDescription
          ></DialogHeader
        >
        <form class="create-event-dialog" @submit.prevent="create">
          <Label class="mb-2 block" for="new-event">Nombre del evento</Label
          ><Input
            id="new-event"
            v-model="title"
            placeholder="Ej. Reunión de noviembre"
            maxlength="200"
            required
            :disabled="creating"
          />
          <div class="dialog-actions">
            <Button type="button" variant="outline" :disabled="creating" @click="showCreate = false"
              >Cancelar</Button
            ><Button type="submit" :disabled="creating || !title.trim()">{{
              creating ? "Creando…" : "Crear evento"
            }}</Button>
          </div>
        </form></DialogContent
      >
      <AppNotice v-if="loadError" kind="error">
        {{ loadError }}
        <Button variant="outline" size="sm" :disabled="loading" @click="load"
          >Volver a intentar</Button
        >
      </AppNotice>
      <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
      <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
      <div class="event-list-toolbar">
        <p>
          <strong>{{ events.length }}</strong> {{ events.length === 1 ? "evento" : "eventos" }}
          <span class="toolbar-dot">·</span>
          {{ opened }} {{ opened === 1 ? "abierto" : "abiertos" }}
        </p>
        <div class="event-toolbar-controls">
          <Select v-model="eventStatus"
            ><SelectTrigger aria-label="Filtrar eventos por estado"><SelectValue /></SelectTrigger
            ><SelectContent
              ><SelectItem value="all">Todos los estados</SelectItem
              ><SelectItem value="open">Abiertos</SelectItem
              ><SelectItem value="closed">Cerrados</SelectItem></SelectContent
            ></Select
          >
          <InputGroup class="search-field"
            ><InputGroupAddon><AppIcon name="search" /></InputGroupAddon
            ><InputGroupInput
              v-model="search"
              aria-label="Buscar evento"
              type="search"
              placeholder="Buscar evento"
          /></InputGroup>
        </div>
      </div>
      <div v-if="loading" class="grid gap-2" role="status" aria-label="Cargando tus eventos">
        <Skeleton v-for="index in 4" :key="index" class="h-14 w-full" />
      </div>
      <Card
        v-else-if="visible.length"
        class="event-list gap-0 rounded-xl border shadow-none ring-0 py-0"
        ><Table
          ><TableHeader
            ><TableRow
              ><TableHead>Evento</TableHead
              ><TableHead class="hidden sm:table-cell">Estado</TableHead
              ><TableHead class="hidden sm:table-cell">Fecha de creación</TableHead
              ><TableHead class="text-right"
                ><span class="sr-only sm:not-sr-only">Acciones</span></TableHead
              ></TableRow
            ></TableHeader
          ><TableBody
            ><TableRow
              v-for="event in visible"
              :key="event.id"
              @pointerenter="prefetchEvent(event.id)"
              @focusin="prefetchEvent(event.id)"
              ><TableCell
                ><h2 class="event-list-title">
                  <a :href="reportLink(event.id)">{{ event.title }}</a>
                </h2>
                <div
                  class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:hidden"
                >
                  <Badge :variant="event.is_open ? 'success' : 'outline'">{{
                    event.is_open ? "Abierto" : "Cerrado"
                  }}</Badge
                  ><span>{{ createdOn(event.created_at) }}</span>
                </div></TableCell
              ><TableCell class="hidden sm:table-cell"
                ><Badge :variant="event.is_open ? 'success' : 'outline'">{{
                  event.is_open ? "Abierto" : "Cerrado"
                }}</Badge></TableCell
              ><TableCell class="hidden whitespace-nowrap sm:table-cell">{{
                createdOn(event.created_at)
              }}</TableCell
              ><TableCell
                ><div class="flex items-center justify-end gap-2">
                  <CopyEventLink :event-id="event.id" compact /><Button
                    variant="outline"
                    size="sm"
                    class="hidden sm:inline-flex"
                    as-child
                    ><a :href="reportLink(event.id)">Ver asistencia</a></Button
                  >
                </div></TableCell
              ></TableRow
            ></TableBody
          ></Table
        ></Card
      >
      <Card
        v-else-if="!loadError || filtered"
        class="empty-events gap-0 rounded-xl border shadow-none ring-0 items-center"
      >
        <span class="hero-icon"><AppIcon name="calendar" /></span>
        <h2>
          {{ filtered ? "Ningún evento coincide" : "No hay eventos" }}
        </h2>
        <p class="muted">
          {{
            filtered
              ? "Prueba con otro nombre o cambia el filtro de estado."
              : "Crea un evento y comparte su enlace para comenzar a registrar asistencia."
          }}
        </p>
        <Button v-if="filtered" variant="outline" @click="clearFilters">Quitar filtros</Button>
        <Button v-else @click="showCreate = true"> <AppIcon name="plus" /> Crear evento </Button>
      </Card>
    </div>
  </Dialog>
</template>
