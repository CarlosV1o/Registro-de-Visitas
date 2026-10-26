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
import AdminShellSkeleton from "./AdminShellSkeleton.vue";
import AdminSidebar from "./AdminSidebar.vue";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import AppIcon from "./AppIcon.vue";
import { appLink } from "../lib/links";

const pageContext = usePageContext();
const employeePage = computed(() => pageContext.urlPathname.includes("/admin/empleados"));

// Inside an event, the trail links back to the event list and names the current section.
const eventSection = computed(() =>
  /\/admin\/eventos\/[^/]+\/configuracion\/?$/.test(pageContext.urlPathname)
    ? "Configuración del evento"
    : /\/admin\/eventos\/[^/]+\/?$/.test(pageContext.urlPathname)
      ? "Detalle del evento"
      : null,
);

// A tab that already confirmed admin access renders the shell at once and re-checks in
// the background, so moving between public and admin pages does not flash a check screen.
const knownAdmin = cache.admin();
const session = ref<Session | null>(null);
const authorized = ref(knownAdmin !== null);
const loading = ref(knownAdmin === null);
const checking = ref(false);
const error = ref("");
const email = computed(() => session.value?.user.email ?? cache.admin() ?? undefined);
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

// A confirmed admin keeps the shell while re-checking in the background; otherwise the
// shell skeleton shows at once, including right after signing in.
async function authorize() {
  checking.value = true;
  error.value = "";

  if (!authorized.value) loading.value = true;

  try {
    if (!supabase) return;

    const result = await supabase.auth.getSession();

    if (result.error) throw result.error;

    if (!mounted) return;

    if (!result.data.session) {
      session.value = null;
      authorized.value = false;
      cache.setAdmin(null);

      return;
    }

    const role = await getRole();

    if (!mounted) return;

    session.value = result.data.session;
    authorized.value = role === "admin";
    cache.setAdmin(authorized.value ? (result.data.session.user.email ?? "") : null);

    if (!authorized.value) error.value = "Esta cuenta no tiene permisos de administración.";
  } catch {
    if (mounted) error.value = "No pudimos comprobar tus permisos. Vuelve a intentarlo.";
  } finally {
    if (mounted) {
      loading.value = false;
      checking.value = false;
    }
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
  <AdminShellSkeleton v-if="loading" />
  <LoginPanel v-else-if="!session && !authorized" @signed-in="authorize" />
  <SidebarProvider v-else class="admin-app"
    ><AdminSidebar :employee-page="employeePage" :email="email" @sign-out="signOut" /><SidebarInset
      class="min-w-0"
    >
      <header class="admin-topbar">
        <div class="flex items-center gap-3">
          <SidebarTrigger aria-label="Mostrar navegación" /><Separator
            orientation="vertical"
            class="h-4 data-[orientation=vertical]:self-center"
          />
          <Breadcrumb
            ><BreadcrumbList
              ><BreadcrumbItem class="hidden sm:inline-flex">Administración</BreadcrumbItem
              ><BreadcrumbSeparator class="hidden sm:block" /><template v-if="eventSection"
                ><BreadcrumbItem
                  ><BreadcrumbLink :href="appLink('admin')">Eventos</BreadcrumbLink></BreadcrumbItem
                ><BreadcrumbSeparator /><BreadcrumbItem
                  ><BreadcrumbPage>{{ eventSection }}</BreadcrumbPage></BreadcrumbItem
                ></template
              ><BreadcrumbItem v-else
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
        <slot v-if="authorized" /><Button
          variant="outline"
          v-else
          :disabled="checking"
          @click="authorize"
          >Volver a intentar</Button
        ><Button v-if="!authorized" variant="ghost" class="ml-2" @click="signOut"
          >Usar otra cuenta</Button
        >
      </div></SidebarInset
    ></SidebarProvider
  >
</template>
