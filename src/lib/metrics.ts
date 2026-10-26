import type { Attendance, Employee } from "./models";

// Employees expected at the event: its uploaded roster or, without one, the active base.
export function expectedEmployees(employees: Employee[], roster: string[]) {
  if (!roster.length) return employees.filter((employee) => employee.active);

  const byId = new Map(employees.map((employee) => [employee.id, employee]));

  return roster.flatMap((id) => byId.get(id) ?? []);
}

export function attendanceMetrics(
  employees: Employee[],
  attendance: Attendance[],
  roster: string[],
) {
  const expected = expectedEmployees(employees, roster);
  const present = new Set(attendance.map((entry) => entry.employee_id));
  const scheduled = new Set(roster);
  const pending = expected.filter((employee) => !present.has(employee.id)).length;

  return {
    total: expected.length,
    registered: attendance.length,
    pending,
    unscheduled: roster.length
      ? attendance.filter((entry) => !scheduled.has(entry.employee_id)).length
      : 0,
    percent: expected.length
      ? Math.round(((expected.length - pending) / expected.length) * 100)
      : 0,
  };
}

export function attendanceByAdvisor(attendance: Attendance[]) {
  const counts = new Map<string, number>();

  for (const entry of attendance) {
    const name = entry.asesor.trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"),
  );
}
