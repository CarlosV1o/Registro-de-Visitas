import type { AttendanceEvent, Attendance, Employee } from "./models";

// Keeps the last loaded admin data in memory so client-side navigation renders
// immediately and refreshes in the background instead of flashing a loading state.
// It lives only for the tab session and is cleared on sign-out.
let events: AttendanceEvent[] | undefined;
let employees: Employee[] | undefined;
const eventDetails = new Map<string, AttendanceEvent | null>();
const attendance = new Map<string, Attendance[]>();

// Email of the account last confirmed as admin in this tab. It only skips the access
// check screen on client navigation; Postgres policies still authorize every request.
let adminEmail: string | null = null;

// Bumped on sign-out so late background requests cannot refill a cleared cache.
let generation = 0;

export const cache = {
  admin: () => adminEmail,
  setAdmin(email: string | null) {
    adminEmail = email;
  },
  generation: () => generation,
  events: () => events,
  setEvents(value: AttendanceEvent[]) {
    events = value;
  },
  employees: () => employees,
  setEmployees(value: Employee[]) {
    employees = value;
  },
  event: (eventId: string) => eventDetails.get(eventId),
  setEvent(eventId: string, value: AttendanceEvent | null) {
    eventDetails.set(eventId, value);
  },
  attendance: (eventId: string) => attendance.get(eventId),
  setAttendance(eventId: string, value: Attendance[]) {
    attendance.set(eventId, value);
  },
  clear() {
    events = undefined;
    employees = undefined;
    eventDetails.clear();
    attendance.clear();
    adminEmail = null;
    generation++;
  },
};
