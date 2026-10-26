<script setup lang="ts">
import { navigate } from "vike/client/router";
import { appLink } from "../../lib/links";
import LoginPanel from "../../components/LoginPanel.vue";
</script>
<template><LoginPanel @signed-in="navigate(appLink('admin'))" /></template>
