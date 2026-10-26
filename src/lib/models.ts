import { z } from "zod";

const detail = z.string().max(300);

export const employeeSchema = z.object({
  id: z.string().trim().min(1).max(100),
  nombre: z.string().trim().min(1).max(300),
  tienda: detail,
  plaza: detail,
  region: detail,
  asesor: detail,
  posicion: detail,
  active: z.boolean(),
});

export type Employee = z.infer<typeof employeeSchema>;

export const attendanceSchema = z.object({
  event_id: z.uuid(),
  employee_id: z.string(),
  nombre: z.string(),
  tienda: z.string(),
  plaza: z.string(),
  region: z.string(),
  asesor: z.string(),
  posicion: z.string(),
  checked_in_at: z.iso.datetime({ offset: true }),
});

export type Attendance = z.infer<typeof attendanceSchema>;

export const eventSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  is_open: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
});

export type AttendanceEvent = z.infer<typeof eventSchema>;

export const roleSchema = z.enum(["admin", "staff"]).nullable();

export type Role = z.infer<typeof roleSchema>;
