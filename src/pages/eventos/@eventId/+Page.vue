<script setup lang="ts">
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppNotice from "@/components/AppNotice.vue";
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
const receipt = ref<{ accepted: true } | null>(null);
const input = ref<InstanceType<typeof Input> | null>(null);
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

    const limited = z.object({ code: z.literal("PT429") }).safeParse(cause).success;
    error.value = limited
      ? "Se alcanzó el límite de solicitudes. Espera unos minutos antes de intentarlo otra vez."
      : "No se pudo procesar la solicitud. Revisa tu conexión o consulta al organizador.";
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
        <Card
          class="registration-card gap-0 rounded-xl border shadow-none ring-0 py-0"
          aria-labelledby="register-title"
        >
          <Badge :variant="event.is_open ? 'secondary' : 'outline'" class="registration-status">{{
            event.is_open ? "Registro abierto" : "Evento cerrado"
          }}</Badge>
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
            /><Button class="register-button" :disabled="registering || !employeeId.trim()">
              {{ registering ? "Registrando…" : "Registrar mi asistencia"
              }}<AppIcon v-if="!registering" name="arrow" />
            </Button>
          </form>
          <AppNotice v-if="receipt" kind="success">
            <div>
              <strong>Solicitud recibida</strong>
              <p>
                Si el número corresponde a un empleado activo y el evento está abierto, su
                asistencia quedará registrada.
              </p>
              <span>Para confirmar o corregir el registro, consulta al organizador.</span>
            </div>
          </AppNotice>
          <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
          <div class="form-footnote">
            <AppIcon name="clock" /><span>La hora se guarda automáticamente.</span>
          </div>
        </Card>
        <p class="registration-help">¿Necesitas ayuda? Acércate al organizador del evento.</p>
      </template>
      <Card
        v-else
        class="registration-card not-found gap-0 rounded-xl border shadow-none ring-0 py-0"
      >
        <AppIcon name="calendar" />
        <h1>{{ error ? "No se pudo cargar el evento" : "Evento no encontrado" }}</h1>
        <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
        <p v-else>Comprueba el enlace o solicita uno nuevo al organizador.</p>
        <Button variant="outline" v-if="error" @click="load">Volver a intentar</Button
        ><Button v-else variant="outline" as-child><a :href="appLink()">Ir al inicio</a></Button>
      </Card>
    </main>
  </div>
</template>
