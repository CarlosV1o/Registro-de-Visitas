<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { Session, Subscription } from "@supabase/supabase-js";
import { client, supabase } from "../lib/supabase";
import { getRole } from "../lib/api";
import { appLink } from "../lib/links";
import LoginPanel from "./LoginPanel.vue";
import BrandMark from "./BrandMark.vue";
import AppIcon from "./AppIcon.vue";

const session = ref<Session | null>(null);
const authorized = ref(false);
const loading = ref(true);
const error = ref("");
let subscription: Subscription | undefined;
let mounted = true;

async function authorize() {
  loading.value = true;
  error.value = "";
  authorized.value = false;

  try {
    if (!supabase) return;

    const result = await supabase.auth.getSession();

    if (result.error) throw result.error;

    if (!mounted) return;

    session.value = result.data.session;

    if (!result.data.session) return;

    const role = await getRole();

    if (!mounted) return;

    authorized.value = role === "admin";

    if (!authorized.value) error.value = "Esta cuenta no tiene permisos de administración.";
  } catch {
    if (mounted) error.value = "No pudimos comprobar tus permisos. Vuelve a intentarlo.";
  } finally {
    if (mounted) loading.value = false;
  }
}

async function signOut() {
  const result = await client().auth.signOut({ scope: "local" });

  if (result.error) {
    error.value = "No se pudo cerrar sesión. Vuelve a intentarlo.";

    return;
  }

  session.value = null;
  authorized.value = false;
}

onMounted(() => {
  subscription = supabase?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      session.value = null;
      authorized.value = false;
    }
  }).data.subscription;
  void authorize();
});

onUnmounted(() => {
  mounted = false;
  subscription?.unsubscribe();
});
</script>
<template>
  <main v-if="loading" class="loading-screen" role="status">Comprobando acceso…</main>
  <LoginPanel v-else-if="!session" @signed-in="authorize" />
  <div v-else class="admin-app">
    <header class="app-header">
      <BrandMark />
      <nav class="header-actions" aria-label="Administración">
        <a :href="appLink('admin')">Eventos</a><a :href="appLink('admin/empleados')">Empleados</a
        ><span class="account-email">{{ session.user.email }}</span
        ><button
          class="icon-button"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          @click="signOut"
        >
          <AppIcon name="logout" />
        </button>
      </nav>
    </header>
    <main class="admin-workspace">
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <slot v-if="authorized" /><button v-else @click="authorize">Volver a intentar</button>
    </main>
  </div>
</template>
