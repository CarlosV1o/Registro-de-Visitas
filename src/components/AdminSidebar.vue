<script setup lang="ts">
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { appLink } from "../lib/links";
import BrandMark from "./BrandMark.vue";
import AppIcon from "./AppIcon.vue";

defineProps<{ employeePage: boolean; email?: string }>();

const emit = defineEmits<{ signOut: [] }>();
const { setOpenMobile } = useSidebar();
</script>

<template>
  <Sidebar class="admin-sidebar"
    ><SidebarHeader class="px-5 py-6"><BrandMark :href="appLink('admin')" /></SidebarHeader
    ><SidebarContent class="px-3"
      ><nav aria-label="Administración">
        <SidebarMenu
          ><SidebarMenuItem
            ><SidebarMenuButton as-child :is-active="!employeePage"
              ><a
                :href="appLink('admin')"
                :aria-current="!employeePage ? 'page' : undefined"
                @click="setOpenMobile(false)"
                ><AppIcon name="calendar" /><span>Eventos</span></a
              ></SidebarMenuButton
            ></SidebarMenuItem
          ><SidebarMenuItem
            ><SidebarMenuButton as-child :is-active="employeePage"
              ><a
                :href="appLink('admin/empleados')"
                :aria-current="employeePage ? 'page' : undefined"
                @click="setOpenMobile(false)"
                ><AppIcon name="users" /><span>Empleados</span></a
              ></SidebarMenuButton
            ></SidebarMenuItem
          ></SidebarMenu
        >
      </nav></SidebarContent
    ><SidebarFooter class="p-4"
      ><div class="sidebar-account">
        <span class="workspace-avatar"><AppIcon name="lock" /></span>
        <div>
          <strong>Administrador</strong><span>{{ email }}</span>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar sesión" @click="emit('signOut')"
          ><AppIcon name="logout"
        /></Button></div></SidebarFooter
  ></Sidebar>
</template>
