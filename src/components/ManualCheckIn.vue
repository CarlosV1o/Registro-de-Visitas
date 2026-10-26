<script setup lang="ts">
import AppNotice from "@/components/AppNotice.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { computed, reactive, ref, watch } from "vue";
import { registerManualAttendance } from "../lib/api";
import { employeeSchema, type Employee } from "../lib/models";
import AppIcon from "./AppIcon.vue";
import SuggestField, { type Suggestion } from "./SuggestField.vue";

const props = defineProps<{
  eventId: string;
  isOpen: boolean;
  scheduled: boolean;
  employees: Employee[];
  attended: Set<string>;
}>();

const emit = defineEmits<{ registered: [] }>();

const details = ["tienda", "plaza", "region", "asesor", "posicion"] as const;

type Detail = (typeof details)[number];

const open = ref(false);

const form = reactive({
  id: "",
  nombre: "",
  tienda: "",
  plaza: "",
  region: "",
  asesor: "",
  posicion: "",
});

const schedule = ref(true);
const busy = ref(false);
const error = ref("");
const message = ref("");

const match = computed(() => props.employees.find((employee) => employee.id === form.id.trim()));
const duplicate = computed(() => props.attended.has(form.id.trim()));

const people = computed<Suggestion[]>(() =>
  props.employees.map((employee) => ({
    value: employee.id,
    label: employee.nombre,
    detail: [employee.id, employee.tienda].filter(Boolean).join(" · "),
  })),
);

// Distinct values already in the base for a field that repeats across employees.
function distinct(field: Detail): Suggestion[] {
  const values = new Set(
    props.employees.map((employee) => employee[field]).filter((value) => value.trim()),
  );

  return [...values]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((value) => ({ value, label: value }));
}

const suggestions = computed(() => ({
  tienda: distinct("tienda"),
  plaza: distinct("plaza"),
  region: distinct("region"),
  asesor: distinct("asesor"),
  posicion: distinct("posicion"),
}));

function fill(source: Partial<Pick<Employee, "nombre" | Detail>>) {
  form.nombre = source.nombre ?? "";

  for (const field of details) form[field] = source[field] ?? "";
}

function selectEmployee(option: Suggestion) {
  form.id = option.value;

  const employee = props.employees.find((entry) => entry.id === option.value);

  if (employee) fill(employee);
}

// A known store fills its usual plaza, region and advisor when those are still empty.
function selectTienda(option: Suggestion) {
  form.tienda = option.value;

  const peers = props.employees.filter((employee) => employee.tienda === option.value);

  for (const field of ["plaza", "region", "asesor"] as const) {
    if (form[field].trim()) continue;

    const counts = new Map<string, number>();

    for (const employee of peers)
      if (employee[field].trim())
        counts.set(employee[field], (counts.get(employee[field]) ?? 0) + 1);

    const [common] = [...counts].sort((a, b) => b[1] - a[1]);

    if (common) form[field] = common[0];
  }
}

// Typing a known ID fills in its current data; leaving it clears what was filled in.
watch(match, (employee, previous) => {
  if (employee) fill(employee);
  else if (previous) fill({});
});

watch(open, (value) => {
  if (!value) return;

  error.value = "";
  message.value = "";
});

function reset() {
  form.id = "";
  fill({});
  schedule.value = true;
}

async function submit() {
  if (busy.value) return;

  error.value = "";
  message.value = "";

  const checked = employeeSchema.safeParse({ ...form, active: true });

  if (!checked.success) {
    error.value =
      "Número de empleado y nombre son obligatorios; el número admite 100 caracteres y los detalles 300.";

    return;
  }

  busy.value = true;

  try {
    const result = await registerManualAttendance(
      props.eventId,
      checked.data,
      props.scheduled && schedule.value,
    );

    message.value = result.created
      ? `Asistencia registrada para ${result.record.nombre}.${result.registered ? " Se agregó a la base de empleados." : ""}`
      : `${result.record.nombre} ya tenía asistencia registrada.`;
    reset();
    emit("registered");
    document.getElementById("manual-id")?.focus();
  } catch {
    error.value =
      "No se pudo registrar. Verifica que el evento esté abierto, tus permisos y tu conexión. No se guardó ningún cambio.";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open"
    ><DialogTrigger as-child
      ><Button variant="outline"><AppIcon name="plus" /> Registro manual</Button></DialogTrigger
    ><DialogContent class="manual-check-in sm:max-w-2xl"
      ><DialogHeader
        ><DialogTitle>Registrar asistencia manual</DialogTitle
        ><DialogDescription
          >Busca al empleado por número o nombre, o escribe sus datos si no está en la
          base.</DialogDescription
        ></DialogHeader
      >
      <AppNotice v-if="!isOpen" kind="info"
        >El registro de este evento está cerrado. Reábrelo en Configuración para registrar
        asistencias.</AppNotice
      >
      <form class="manual-check-in-form" @submit.prevent="submit">
        <fieldset class="manual-section">
          <legend>Empleado</legend>
          <div class="manual-grid manual-identity">
            <SuggestField
              id="manual-id"
              v-model="form.id"
              label="Número de empleado"
              :options="people"
              :maxlength="100"
              required
              wide-list
              @select="selectEmployee"
            />
            <SuggestField
              id="manual-nombre"
              v-model="form.nombre"
              label="Nombre completo"
              :options="people"
              :maxlength="300"
              required
              wide-list
              @select="selectEmployee"
            />
          </div>
          <p v-if="form.id.trim()" class="manual-status" aria-live="polite">
            <template v-if="duplicate"
              ><Badge variant="destructive">Ya registrado</Badge> Este empleado ya tiene asistencia
              en este evento.</template
            ><template v-else-if="match?.active"
              ><Badge variant="secondary">Empleado existente</Badge> Si cambias sus datos, se
              actualizan en la base.</template
            ><template v-else-if="match"
              ><Badge variant="outline">Inactivo</Badge> Se reactivará al registrarlo.</template
            ><template v-else
              ><Badge variant="success">Nuevo</Badge> Se agregará a la base de empleados.</template
            >
          </p>
        </fieldset>
        <fieldset class="manual-section">
          <legend>Ubicación</legend>
          <div class="manual-grid manual-location">
            <SuggestField
              id="manual-tienda"
              v-model="form.tienda"
              label="Tienda"
              :options="suggestions.tienda"
              :maxlength="300"
              @select="selectTienda"
            />
            <SuggestField
              id="manual-plaza"
              v-model="form.plaza"
              label="Plaza"
              :options="suggestions.plaza"
              :maxlength="300"
              @select="(option) => (form.plaza = option.value)"
            />
            <SuggestField
              id="manual-region"
              v-model="form.region"
              label="Región"
              :options="suggestions.region"
              :maxlength="300"
              @select="(option) => (form.region = option.value)"
            />
          </div>
        </fieldset>
        <fieldset class="manual-section">
          <legend>Puesto</legend>
          <div class="manual-grid manual-role">
            <SuggestField
              id="manual-asesor"
              v-model="form.asesor"
              label="Asesor"
              :options="suggestions.asesor"
              :maxlength="300"
              @select="(option) => (form.asesor = option.value)"
            />
            <SuggestField
              id="manual-posicion"
              v-model="form.posicion"
              label="Posición"
              :options="suggestions.posicion"
              :maxlength="300"
              @select="(option) => (form.posicion = option.value)"
            />
          </div>
        </fieldset>
        <AppNotice v-if="error" kind="error">{{ error }}</AppNotice>
        <AppNotice v-if="message" kind="success">{{ message }}</AppNotice>
        <div class="manual-footer">
          <div v-if="scheduled" class="manual-schedule">
            <Checkbox
              id="manual-schedule"
              :model-value="schedule"
              @update:model-value="(value) => (schedule = value === true)"
            /><Label for="manual-schedule">Agregar a la lista de convocados</Label>
          </div>
          <Button type="submit" :disabled="busy || !isOpen || duplicate"
            ><AppIcon name="check" />{{ busy ? "Registrando…" : "Registrar asistencia" }}</Button
          >
        </div>
      </form>
    </DialogContent></Dialog
  >
</template>
