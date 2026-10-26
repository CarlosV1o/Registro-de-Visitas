<script setup lang="ts">
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AppNotice from "@/components/AppNotice.vue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { onMounted, ref } from "vue";
import BrandMark from "./BrandMark.vue";
import AppIcon from "./AppIcon.vue";
import { appLink } from "../lib/links";
import { client, supabase, consumePasswordSetupRequest } from "../lib/supabase";

const emit = defineEmits<{ signedIn: [] }>();
const email = ref("");
const password = ref("");
const busy = ref(false);
const error = ref("");
const checkingLink = ref(true);

// Only the first mount consumes an invitation/recovery callback.
const pendingPasswordSetup = consumePasswordSetupRequest();
const settingPassword = ref(false);
const confirmation = ref("");

onMounted(async () => {
  if (!supabase) {
    checkingLink.value = false;

    return;
  }

  try {
    const initialization = await supabase.auth.initialize();

    if (initialization.error) throw initialization.error;

    const result = await supabase.auth.getSession();

    if (result.error) throw result.error;

    if (pendingPasswordSetup) {
      if (!result.data.session) throw new Error("Missing invite session");

      settingPassword.value = true;
    } else if (result.data.session) emit("signedIn");
  } catch {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    error.value = "El enlace no es válido o venció. Solicita un nuevo enlace al administrador.";
  } finally {
    checkingLink.value = false;
  }
});

async function savePassword() {
  error.value = "";

  if (password.value !== confirmation.value) {
    error.value = "Las contraseñas no coinciden.";

    return;
  }

  busy.value = true;

  try {
    const result = await client().auth.updateUser({ password: password.value });

    if (result.error) throw result.error;

    password.value = "";
    confirmation.value = "";
    emit("signedIn");
  } catch {
    error.value =
      "No se pudo guardar la contraseña. Usa al menos 8 caracteres o solicita un nuevo enlace si venció.";
  } finally {
    busy.value = false;
  }
}

async function signIn() {
  error.value = "";
  busy.value = true;

  try {
    const response = await client().auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });

    password.value = "";

    if (response.error) throw response.error;

    emit("signedIn");
  } catch {
    error.value = "No se pudo iniciar sesión. Revisa tus datos y tu conexión.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main
    v-if="checkingLink"
    class="loading-screen"
    role="status"
    aria-label="Comprobando sesión"
  ></main>
  <main v-else class="login-layout">
    <Card
      class="login-form gap-0 rounded-xl border shadow-none ring-0 py-0"
      aria-labelledby="login-title"
    >
      <BrandMark /><span class="login-lock"><AppIcon name="lock" /></span>
      <template v-if="supabase && settingPassword">
        <h1 id="login-title">Crear contraseña</h1>
        <p class="muted">Elige una contraseña para entrar al registro de asistencia.</p>
        <form @submit.prevent="savePassword">
          <Label class="mb-2 block" for="new-password">Nueva contraseña</Label>
          <Input
            id="new-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="12"
          />
          <Label class="mb-2 block" for="confirm-password">Confirmar contraseña</Label>
          <Input
            id="confirm-password"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            minlength="12"
          />
          <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
          <Button variant="default" :disabled="busy">
            {{ busy ? "Guardando…" : "Guardar y entrar" }}
          </Button>
        </form>
      </template>
      <template v-else-if="supabase">
        <h1 id="login-title">Iniciar sesión</h1>
        <p class="muted">Accede para administrar tus eventos y consultar la asistencia.</p>
        <form @submit.prevent="signIn">
          <Label class="mb-2 block" for="email">Correo electrónico</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            autofocus
          />
          <Label class="mb-2 block" for="password">Contraseña</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
          <Button variant="default" :disabled="busy">{{ busy ? "Entrando…" : "Entrar" }}</Button>
        </form>
      </template>
      <template v-else>
        <h1 id="login-title">Registro de asistencia</h1>
        <AppNotice kind="info">
          La página está pendiente de configuración. Contacta al administrador para habilitar el
          registro.
        </AppNotice>
      </template>
      <a :href="appLink()" class="login-back">Volver al inicio</a>
    </Card>
  </main>
</template>
