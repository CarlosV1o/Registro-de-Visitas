<script setup lang="ts">
import { onMounted, ref } from "vue";
import { client, supabase, passwordSetupRequested } from "../lib/supabase";

const emit = defineEmits<{ signedIn: [] }>();
const email = ref("");
const password = ref("");
const busy = ref(false);
const error = ref("");
const checkingLink = ref(true);
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

    if (passwordSetupRequested) {
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
  <main class="login-layout">
    <section class="panel login-form" aria-labelledby="login-title">
      <p class="login-brand">Asistencia</p>
      <p v-if="checkingLink" role="status">Comprobando sesión…</p>
      <template v-else-if="supabase && settingPassword">
        <h1 id="login-title">Crear contraseña</h1>
        <p class="muted">Elige una contraseña para entrar al registro de asistencia.</p>
        <form @submit.prevent="savePassword">
          <label for="new-password">Nueva contraseña</label>
          <input
            id="new-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
          />
          <label for="confirm-password">Confirmar contraseña</label>
          <input
            id="confirm-password"
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
          />
          <p v-if="error" class="notice error" role="alert">{{ error }}</p>
          <button class="primary" :disabled="busy">
            {{ busy ? "Guardando…" : "Guardar y entrar" }}
          </button>
        </form>
      </template>
      <template v-else-if="supabase">
        <h1 id="login-title">Iniciar sesión</h1>
        <p class="muted">Ingresa para registrar la asistencia.</p>
        <form @submit.prevent="signIn">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            autofocus
          />
          <label for="password">Contraseña</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <p v-if="error" class="notice error" role="alert">{{ error }}</p>
          <button class="primary" :disabled="busy">{{ busy ? "Entrando…" : "Entrar" }}</button>
        </form>
      </template>
      <template v-else>
        <h1 id="login-title">Registro de asistencia</h1>
        <p class="notice" role="status">
          La página está pendiente de configuración. Contacta al administrador para habilitar el
          registro.
        </p>
      </template>
    </section>
  </main>
</template>
