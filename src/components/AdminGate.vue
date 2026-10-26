<script setup lang="ts">
import AppNotice from "@/components/AppNotice.vue";
import { Button } from "@/components/ui/button";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import type { Session, Subscription } from "@supabase/supabase-js";
import { client, supabase } from "../lib/supabase";
import { getRole } from "../lib/api";
import { cache } from "../lib/cache";
import LoginPanel from "./LoginPanel.vue";
import AdminSidebar from "./AdminSidebar.vue";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import AppIcon from "./AppIcon.vue";

const pageContext = usePageContext();
const employeePage = computed(() => pageContext.urlPathname.includes("/admin/empleados"));
const session = ref<Session | null>(null);
const authorized = ref(false);
const loading = ref(true);
const error = ref("");
const workspace = ref<HTMLElement | null>(null);
let subscription: Subscription | undefined;

// Move focus off the clicked navigation link to the new page content after client routing.
watch(
  () => pageContext.urlPathname,
  async () => {
    await nextTick();
    workspace.value?.focus({ preventScroll: true });
  },
);

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

  cache.clear();
  session.value = null;
  authorized.value = false;
}

onMounted(() => {
  subscription = supabase?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      cache.clear();
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
  <SidebarProvider v-else class="admin-app"
    ><AdminSidebar
      :employee-page="employeePage"
      :email="session.user.email"
      @sign-out="signOut"
    /><SidebarInset class="min-w-0">
      <header class="admin-topbar">
        <div class="flex items-center gap-3">
          <SidebarTrigger aria-label="Mostrar navegación" /><Separator
            orientation="vertical"
            class="h-4 data-[orientation=vertical]:self-center"
          />
          <Breadcrumb
            ><BreadcrumbList
              ><BreadcrumbItem>Administración</BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem
                ><BreadcrumbPage>{{
                  employeePage ? "Empleados" : "Eventos"
                }}</BreadcrumbPage></BreadcrumbItem
              ></BreadcrumbList
            ></Breadcrumb
          >
        </div>
        <span class="topbar-caption"><AppIcon name="lock" /> Acceso administrativo</span>
      </header>
      <div ref="workspace" class="admin-workspace outline-none" tabindex="-1">
        <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
        <slot v-if="authorized" /><Button variant="outline" v-else @click="authorize"
          >Volver a intentar</Button
        >
      </div></SidebarInset
    ></SidebarProvider
  >
</template>
