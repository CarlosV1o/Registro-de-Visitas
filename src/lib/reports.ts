import type { Attendance, Employee } from "./models";

export type ReportRow = Omit<Employee, "active"> & { checked_in_at: string | null };

export type ReportStatus = "attended" | "pending" | "all";

export type ReportSort = "recent" | "name" | "id";

export function reportRows(employees: Employee[], attendance: Attendance[]): ReportRow[] {
  const present = new Set(attendance.map((entry) => entry.employee_id));

  const rows: ReportRow[] = attendance.map((entry) => ({
    id: entry.employee_id,
    nombre: entry.nombre,
    tienda: entry.tienda,
    plaza: entry.plaza,
    region: entry.region,
    asesor: entry.asesor,
    posicion: entry.posicion,
    checked_in_at: entry.checked_in_at,
  }));

  for (const employee of employees) {
    if (employee.active && !present.has(employee.id)) {
      rows.push({ ...employee, checked_in_at: null });
    }
  }

  return rows;
}

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function searchReport(row: ReportRow, query: string) {
  return normalizeSearch(
    [row.id, row.nombre, row.tienda, row.plaza, row.region, row.asesor, row.posicion].join(" "),
  ).includes(normalizeSearch(query));
}

export function sortReport(rows: ReportRow[], sort: ReportSort) {
  return [...rows].sort((a, b) => {
    if (sort === "recent") {
      const byTime = (b.checked_in_at ?? "").localeCompare(a.checked_in_at ?? "");

      if (byTime) return byTime;
    }

    if (sort === "id")
      return a.id.localeCompare(b.id, "es", { numeric: true }) || a.id.localeCompare(b.id);

    return a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id);
  });
}

export function advisorSummary(employees: Employee[], attendance: Attendance[]) {
  const groups = new Map<
    string,
    { name: string; total: number; count: number; pending: number; percent: number }
  >();

  const present = new Set(attendance.map((entry) => entry.employee_id));

  function group(name: string) {
    const key = name.trim();
    let value = groups.get(key);

    if (!value) {
      value = { name: key, total: 0, count: 0, pending: 0, percent: 0 };
      groups.set(key, value);
    }

    return value;
  }

  for (const employee of employees) {
    if (!employee.active) continue;
    const value = group(employee.asesor);
    value.total++;

    if (!present.has(employee.id)) value.pending++;
  }

  for (const entry of attendance) group(entry.asesor).count++;

  for (const value of groups.values()) {
    value.percent = value.total
      ? Math.round(((value.total - value.pending) / value.total) * 100)
      : 0;
  }

  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"),
  );
}

export function reportValues(row: ReportRow) {
  return [
    row.id,
    row.nombre,
    row.tienda,
    row.plaza,
    row.region,
    row.asesor,
    row.posicion,
    row.checked_in_at ?? "",
    row.checked_in_at ? "Asistió" : "Pendiente",
  ];
}

export const reportHeaders = [
  "ID_Empleado",
  "Nombre",
  "Tienda",
  "Plaza",
  "Región",
  "Asesor",
  "Posición",
  "Hora_Registro",
  "Estado",
];
