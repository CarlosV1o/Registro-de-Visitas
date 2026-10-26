<script setup lang="ts">
import { ref } from "vue";
import { client, supabase } from "../lib/supabase";

const emit = defineEmits<{ signedIn: [] }>();
const email = ref("");
const password = ref("");
const busy = ref(false);
const error = ref("");

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
      <template v-if="supabase">
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
