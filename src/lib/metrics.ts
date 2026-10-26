import type { Attendance, Employee } from "./models";

export function attendanceMetrics(employees: Employee[], attendance: Attendance[]) {
  const active = employees.filter((employee) => employee.active);
  const present = new Set(attendance.map((entry) => entry.employee_id));
  const pending = active.filter((employee) => !present.has(employee.id)).length;

  return {
    total: active.length,
    registered: attendance.length,
    pending,
    percent: active.length ? Math.round(((active.length - pending) / active.length) * 100) : 0,
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
