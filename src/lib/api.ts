import { z } from "zod";
import { client } from "./supabase";
import { attendanceSchema, employeeSchema, eventSchema, roleSchema, type Employee } from "./models";
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

export const publicEventSchema = eventSchema.pick({ id: true, title: true, is_open: true });

export async function getPublicEvent(eventId: string) {
  const { data, error } = await client().rpc("event_info", { target_event: eventId });

  if (error) throw error;

  return publicEventSchema.nullable().parse(data);
}

export async function publicCheckIn(eventId: string, employeeId: string) {
  const { data, error } = await client().rpc("register_attendance", {
    target_event: eventId,
    target_employee: employeeId,
  });

  if (error) throw error;

  return z
    .object({
      created: z.boolean(),
      nombre: z.string(),
      checked_in_at: z.iso.datetime({ offset: true }),
    })
    .parse(data);
}

export async function deleteEvent(eventId: string) {
  const { error } = await client().rpc("delete_event", { target_event: eventId });

  if (error) throw error;
}
