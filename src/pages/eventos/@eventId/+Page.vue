<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { z } from "zod";
import { usePageContext } from "vike-vue/usePageContext";
import { getPublicEvent, publicCheckIn, publicEventSchema } from "../../../lib/api";
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
const receipt = ref<{ created: boolean; nombre: string; checked_in_at: string } | null>(null);
const input = ref<HTMLInputElement | null>(null);
let generation = 0;

async function load() {
  const request = ++generation;
  event.value = null;
  receipt.value = null;
  employeeId.value = "";
  error.value = "";
  loading.value = true;

  try {
    if (!z.uuid().safeParse(eventId.value).success) return;

    const result = await getPublicEvent(eventId.value);

    if (request === generation) event.value = result;
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

  try {
    const result = await publicCheckIn(target, employeeId.value.trim());

    if (request !== generation) return;

    receipt.value = result;
    employeeId.value = "";
    input.value?.focus();
  } catch (cause) {
    if (request !== generation) return;

    const invalid = z.object({ code: z.literal("22023") }).safeParse(cause).success;

    error.value = invalid
      ? "No se pudo registrar. Revisa tu número de empleado y que el evento siga abierto."
      : "No se confirmó tu registro. Revisa tu conexión e intenta de nuevo; no se crearán duplicados.";

    if (invalid) {
      try {
        const updated = await getPublicEvent(target);

        if (request === generation) event.value = updated;
      } catch {
        /* Keep the registration error visible when offline. */
      }
    }
  } finally {
    registering.value = false;
  }
}

watch(eventId, load, { immediate: true });

onUnmounted(() => {
  generation++;
});
</script>
<template>
  <div class="public-page">
    <header class="public-header">
      <BrandMark /><a :href="appLink('admin')" class="quiet-link"
        ><AppIcon name="lock" /> Administración</a
      >
    </header>
    <main class="registration-layout">
      <p v-if="loading" class="loading-screen" role="status">Cargando evento…</p>
      <template v-else-if="event">
        <div class="event-intro">
          <span class="hero-icon"><AppIcon name="calendar" /></span>
          <p class="eyebrow">REGISTRO DE ASISTENCIA</p>
          <h1>{{ event.title }}</h1>
        </div>
        <section class="registration-card" aria-labelledby="register-title">
          <span class="status-pill" :class="{ closed: !event.is_open }"
            ><span />{{ event.is_open ? "Registro abierto" : "Evento cerrado" }}</span
          >
          <h2 id="register-title">
            {{ event.is_open ? "Registra tu asistencia" : "El registro ha terminado" }}
          </h2>
          <p class="muted">
            {{
              event.is_open
                ? "Ingresa tu número de empleado."
                : "Este evento ya no recibe registros. Contacta al organizador si necesitas ayuda."
            }}
          </p>
          <form v-if="event.is_open" @submit.prevent="register">
            <label for="employee-id">Número de empleado</label
            ><input
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
            /><button class="primary register-button" :disabled="registering || !employeeId.trim()">
              {{ registering ? "Registrando…" : "Registrar mi asistencia"
              }}<AppIcon v-if="!registering" name="arrow" />
            </button>
          </form>
          <div
            v-if="receipt"
            class="receipt"
            :class="{ duplicate: !receipt.created }"
            role="status"
            aria-live="polite"
          >
            <span class="receipt-icon"><AppIcon name="check" /></span>
            <div>
              <strong>{{
                receipt.created
                  ? "¡Listo! Tu asistencia está registrada."
                  : "Tu asistencia ya estaba registrada."
              }}</strong>
              <p>{{ receipt.nombre }}</p>
              <span>{{
                new Date(receipt.checked_in_at).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              }}</span>
            </div>
          </div>
          <p v-if="error" class="notice error" role="alert">{{ error }}</p>
          <div class="form-footnote">
            <AppIcon name="clock" /><span>La hora se guarda automáticamente.</span>
          </div>
        </section>
        <p class="registration-help">¿Necesitas ayuda? Acércate al organizador del evento.</p>
      </template>
      <section v-else class="registration-card not-found">
        <AppIcon name="calendar" />
        <h1>{{ error ? "No se pudo cargar el evento" : "Evento no encontrado" }}</h1>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-else>Comprueba el enlace o solicita uno nuevo al organizador.</p>
        <button v-if="error" @click="load">Volver a intentar</button
        ><a v-else :href="appLink()" class="button">Ir al inicio</a>
      </section>
    </main>
  </div>
</template>
