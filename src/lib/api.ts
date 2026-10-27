import { z } from "zod";
import { client } from "./supabase";
import {
  attendanceSchema,
  employeeSchema,
  eventSchema,
  roleSchema,
  rosterImportSchema,
  type Employee,
  type AttendanceEvent,
} from "./models";
import { importResponseSchema } from "./csv";

export async function getRole() {
  const { data, error } = await client().rpc("current_role");

  if (error) throw error;

  return roleSchema.parse(data);
}

export async function getEvents() {
  const { data, error } = await client()
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return z.array(eventSchema).parse(data);
}

export async function getEmployees() {
  const employees: Employee[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await client()
      .from("employees")
      .select("*")
      .order("id")
      .range(page * 500, page * 500 + 499);

    if (error) throw error;

    const rows = z.array(employeeSchema).parse(data);
    employees.push(...rows);

    if (rows.length < 500) return employees;

    page++;
  }
}

export async function getAttendance(eventId: string) {
  const records = [];
  let page = 0;

  while (true) {
    const { data, error } = await client()
      .from("attendance")
      .select("event_id,employee_id,nombre,tienda,plaza,region,asesor,posicion,checked_in_at")
      .eq("event_id", eventId)
      .order("employee_id")
      .range(page * 500, page * 500 + 499);

    if (error) throw error;

    const rows = z.array(attendanceSchema).parse(data);
    records.push(...rows);

    if (rows.length < 500) return records;

    page++;
  }
}

// Scheduled employee IDs of the event. An empty list means the event has no roster.
export async function getRoster(eventId: string) {
  const ids: string[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await client()
      .from("event_roster")
      .select("employee_id")
      .eq("event_id", eventId)
      .order("employee_id")
      .range(page * 500, page * 500 + 499);

    if (error) throw error;

    const rows = z.array(z.object({ employee_id: z.string() })).parse(data);
    ids.push(...rows.map((row) => row.employee_id));

    if (rows.length < 500) return ids;

    page++;
  }
}

export async function importEventRoster(eventId: string, employees: Employee[]) {
  const { data, error } = await client().rpc("import_event_roster", {
    target_event: eventId,
    records: employees,
  });

  if (error) throw error;

  return rosterImportSchema.parse(data);
}

export async function clearEventRoster(eventId: string) {
  const { error } = await client().rpc("clear_event_roster", { target_event: eventId });

  if (error) throw error;
}

// Upserts the employee and records attendance in one transaction. With schedule, the
// employee is also added to the event's list when it has one.
export async function registerManualAttendance(
  eventId: string,
  employee: Employee,
  schedule: boolean,
) {
  const { data, error } = await client().rpc("register_manual_attendance", {
    target_event: eventId,
    employee,
    schedule,
  });

  if (error) throw error;

  return z
    .object({ created: z.boolean(), registered: z.boolean(), record: attendanceSchema })
    .parse(data);
}

export async function checkIn(eventId: string, employeeId: string) {
  const { data, error } = await client().rpc("check_in", {
    target_event: eventId,
    target_employee: employeeId,
  });

  if (error) throw error;

  return z.object({ created: z.boolean(), record: attendanceSchema }).parse(data);
}

export async function importEmployees(employees: Employee[]) {
  const { data, error } = await client().rpc("import_employees", { records: employees });

  if (error) throw error;

  return importResponseSchema.parse(data);
}

export async function createEvent(title: string) {
  const { data, error } = await client().from("events").insert({ title }).select("*").single();

  if (error) throw error;

  return eventSchema.parse(data);
}

export async function updateEvent(eventId: string, title: string, isOpen: boolean) {
  const { error } = await client()
    .from("events")
    .update({ title, is_open: isOpen })
    .eq("id", eventId);

  if (error) throw error;
}

export async function getEvent(eventId: string) {
  const { data, error } = await client().from("events").select("*").eq("id", eventId).maybeSingle();

  if (error) throw error;

  return eventSchema.nullable().parse(data);
}

export const publicEventSchema = eventSchema.pick({
  id: true,
  title: true,
  is_open: true,
  image_path: true,
});

export async function getPublicEvent(eventId: string) {
  const { data, error } = await client().rpc("event_info", { target_event: eventId });

  if (error) throw error;

  return publicEventSchema.nullable().parse(data);
}

export const publicReceiptSchema = z.object({ accepted: z.literal(true) }).strict();

export async function publicCheckIn(eventId: string, employeeId: string) {
  const { data, error } = await client().rpc("register_attendance", {
    target_event: eventId,
    target_employee: employeeId,
  });

  if (error) throw error;

  // Reject an old backend that still exposes employee-specific receipts.
  return publicReceiptSchema.parse(data);
}

export async function deleteEvent(eventId: string) {
  const { error } = await client().rpc("delete_event", { target_event: eventId });

  if (error) throw error;
}

export async function clearEmployees() {
  const { error } = await client().rpc("clear_employees");

  if (error) throw error;
}

export function eventImageUrl(path: string | null) {
  return path ? client().storage.from("event-images").getPublicUrl(path).data.publicUrl : undefined;
}

export async function setEventImage(event: AttendanceEvent, file: File | null) {
  let path: string | null = null;

  if (file) {
    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : null;

    if (!extension || !file.size || file.size > 5 * 1024 * 1024)
      throw new Error("Selecciona una imagen JPG, PNG o WebP de hasta 5 MB.");

    path = `${event.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from("event-images").upload(path, file);

    if (error) throw new Error("No se pudo subir la imagen. Revisa la conexión y tus permisos.");
  }

  const { error } = await client()
    .from("events")
    .update({ image_path: path })
    .eq("id", event.id)
    .select("id")
    .single();

  if (error) {
    if (path) await client().storage.from("event-images").remove([path]);
    throw new Error("No se pudo guardar la imagen del evento. Vuelve a intentarlo.");
  }

  if (event.image_path) await client().storage.from("event-images").remove([event.image_path]);
}
