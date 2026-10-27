<script setup lang="ts">
import EmployeeCheckInCard from "../../../components/EmployeeCheckInCard.vue";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppNotice from "@/components/AppNotice.vue";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { z } from "zod";
import { usePageContext } from "vike-vue/usePageContext";
import {
  checkIn,
  eventImageUrl,
  getRole,
  getPublicEvent,
  publicCheckIn,
  publicEventSchema,
} from "../../../lib/api";
import { client } from "../../../lib/supabase";
import { appLink } from "../../../lib/links";
import BrandMark from "../../../components/BrandMark.vue";
import AppIcon from "../../../components/AppIcon.vue";

const pageContext = usePageContext();
const eventId = computed(() => pageContext.routeParams.eventId ?? "");
const event = ref<z.infer<typeof publicEventSchema> | null>(null);
const loading = ref(true);
const registering = ref(false);
const employeeId = ref("");
const error = ref("");
const receipt = ref<{ accepted: true } | null>(null);
const operator = ref(false);
const confirmed = ref<Awaited<ReturnType<typeof checkIn>> | null>(null);
const input = ref<InstanceType<typeof Input> | null>(null);
let generation = 0;

async function load() {
  const request = ++generation;
  event.value = null;
  receipt.value = null;
  confirmed.value = null;
  operator.value = false;
  employeeId.value = "";
  error.value = "";
  loading.value = true;

  try {
    if (!z.uuid().safeParse(eventId.value).success) return;

    const result = await getPublicEvent(eventId.value);

    if (request !== generation) return;

    event.value = result;
    const session = await client().auth.getSession();

    if (session.error) throw session.error;

    if (session.data.session) {
      const role = await getRole();

      if (request === generation) operator.value = role === "admin";
    }
  } catch {
    if (request === generation)
      error.value = "No pudimos cargar el evento. Revisa tu conexión y vuelve a intentar.";
  } finally {
    if (request === generation) loading.value = false;
  }
}

async function register() {
  if (!event.value?.is_open || !employeeId.value.trim() || registering.value) return;

  const request = generation;
  const target = eventId.value;
  registering.value = true;
  error.value = "";
  receipt.value = null;
  confirmed.value = null;

  try {
    if (operator.value) {
      const result = await checkIn(target, employeeId.value.trim());

      if (request !== generation) return;

      confirmed.value = result;
    } else {
      const result = await publicCheckIn(target, employeeId.value.trim());

      if (request !== generation) return;

      receipt.value = result;
    }

    employeeId.value = "";
  } catch (cause) {
    if (request !== generation) return;

    const limited = z.object({ code: z.literal("PT429") }).safeParse(cause).success;

    const invalid =
      operator.value && z.object({ code: z.literal("22023") }).safeParse(cause).success;

    error.value = limited
      ? "Se alcanzó el límite de solicitudes. Espera unos minutos antes de intentarlo otra vez."
      : invalid
        ? "No se encontró un empleado activo con ese número o el evento está cerrado."
        : "No se pudo procesar la solicitud. Revisa tu conexión o consulta al organizador.";
  } finally {
    registering.value = false;

    if (request === generation) void nextTick(() => input.value?.focus());
  }
}

watch(employeeId, (value) => {
  if (value.trim()) {
    receipt.value = null;
    confirmed.value = null;
  }
});

watch(eventId, load, { immediate: true });

onUnmounted(() => {
  generation++;
});
</script>

<template>
  <div class="public-page" :class="{ 'event-with-background': event?.image_path }">
    <img
      v-if="event?.image_path"
      :src="eventImageUrl(event.image_path)"
      alt=""
      aria-hidden="true"
      class="event-background"
    />
    <header class="public-header">
      <BrandMark /><a :href="appLink('admin')" class="quiet-link"
        ><AppIcon name="lock" /> Administración</a
      >
    </header>
    <main class="registration-layout">
      <div v-if="loading" role="status" aria-label="Cargando evento">
        <div class="event-intro flex flex-col items-center gap-3">
          <Skeleton class="size-14 rounded-2xl" /><Skeleton class="h-3 w-40" /><Skeleton
            class="h-9 w-72 max-w-full"
          />
        </div>
        <Card class="registration-card gap-0 rounded-xl border shadow-none ring-0 py-0">
          <Skeleton class="mb-3 h-7 w-56 max-w-full" /><Skeleton class="mb-7 h-4 w-44" /><Skeleton
            class="mb-2 h-4 w-36"
          /><Skeleton class="h-14 w-full rounded-xl" /><Skeleton
            class="mt-4 h-13 w-full rounded-full"
          />
        </Card>
      </div>
      <template v-else-if="event">
        <div class="event-intro" :class="{ 'site-event-intro': operator }">
          <span v-if="!operator && !event.image_path" class="hero-icon"
            ><AppIcon name="calendar"
          /></span>
          <p class="eyebrow">{{ operator ? "REGISTRO EN SITIO" : "REGISTRO DE ASISTENCIA" }}</p>
          <h1>{{ event.title }}</h1>
        </div>
        <Card
          class="registration-card gap-0 rounded-xl border shadow-none ring-0 py-0"
          aria-labelledby="register-title"
        >
          <div class="registration-card-heading">
            <h2 id="register-title">
              {{
                event.is_open
                  ? operator
                    ? "Registrar ingreso"
                    : "Registra tu asistencia"
                  : "El registro ha terminado"
              }}
            </h2>
            <Badge :variant="event.is_open ? 'success' : 'outline'" class="shrink-0">{{
              event.is_open ? "Abierto" : "Cerrado"
            }}</Badge>
          </div>
          <p class="muted">
            {{
              event.is_open
                ? operator
                  ? "Escribe el número de empleado y presiona Enter."
                  : "Ingresa tu número de empleado."
                : "Este evento ya no recibe registros. Contacta al organizador si necesitas ayuda."
            }}
          </p>
          <form v-if="event.is_open" @submit.prevent="register">
            <Label class="mb-2 block" for="employee-id">Número de empleado</Label
            ><Input
              id="employee-id"
              ref="input"
              v-model="employeeId"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="Ej. 004509"
              maxlength="100"
              required
              :disabled="registering"
            /><Button class="register-button" :disabled="registering || !employeeId.trim()"
              >{{
                registering
                  ? "Procesando…"
                  : operator
                    ? "Registrar ingreso"
                    : "Registrar mi asistencia"
              }}<AppIcon v-if="!registering" name="arrow"
            /></Button>
          </form>
          <AppNotice v-if="receipt" kind="success"
            ><div>
              <strong>Solicitud recibida</strong>
              <p>
                Si el número corresponde a un empleado activo y el evento está abierto, su
                asistencia quedará registrada.
              </p>
              <span>Para confirmar o corregir el registro, consulta al organizador.</span>
            </div></AppNotice
          >
          <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
          <div v-if="!operator" class="form-footnote">
            <AppIcon name="clock" /><span>La hora se guarda automáticamente.</span>
          </div>
        </Card>
        <EmployeeCheckInCard
          class="mt-5"
          v-if="confirmed"
          :employee="{ id: confirmed.record.employee_id, nombre: confirmed.record.nombre }"
          :phase="confirmed.created ? 'confirmed' : 'duplicate'"
          :checked-in-at="confirmed.record.checked_in_at"
        />
        <p v-if="!operator" class="registration-help">
          ¿Necesitas ayuda? Acércate al organizador del evento.
        </p>
      </template>
      <Card
        v-else
        class="registration-card not-found gap-0 rounded-xl border shadow-none ring-0 py-0"
        ><AppIcon name="calendar" />
        <h1>{{ error ? "No se pudo cargar el evento" : "Evento no encontrado" }}</h1>
        <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
        <p v-else>Comprueba el enlace o solicita uno nuevo al organizador.</p>
        <Button v-if="error" variant="outline" @click="load">Volver a intentar</Button
        ><Button v-else variant="outline" as-child
          ><a :href="appLink()">Ir al inicio</a></Button
        ></Card
      >
    </main>
  </div>
</template>
