import { describe, expect, it } from "vite-plus/test";
import { advisorSummary, reportRows, reportValues, searchReport, sortReport } from "./reports";
import { reportWorkbook } from "./workbook";
import type { Attendance, Employee } from "./models";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Reunión",
  is_open: true,
  created_at: "2026-10-26T12:00:00Z",
};

const employees: Employee[] = [
  {
    id: "001",
    nombre: "Ángela",
    tienda: "Centro",
    plaza: "Tijuana",
    region: "Norte",
    asesor: "Ana",
    posicion: "Gerente",
    active: true,
  },
  {
    id: "1",
    nombre: "Beto",
    tienda: "Sur",
    plaza: "Ensenada",
    region: "Baja",
    asesor: "Ana",
    posicion: "Vendedor",
    active: true,
  },
  {
    id: "003",
    nombre: "Inactivo",
    tienda: "",
    plaza: "",
    region: "",
    asesor: "",
    posicion: "",
    active: false,
  },
];

const attendance: Attendance[] = [
  {
    ...employees[0]!,
    event_id: event.id,
    employee_id: "001",
    asesor: "Anterior",
    checked_in_at: "2026-10-26T13:00:00Z",
  },
  {
    ...employees[2]!,
    event_id: event.id,
    employee_id: "003",
    checked_in_at: "2026-10-26T14:00:00Z",
  },
];

describe("attendance reports", () => {
  it("retains historical attendance and includes only unmatched active employees as pending", () => {
    const rows = reportRows(employees, attendance, []);
    expect(rows.map((row) => row.id)).toEqual(["001", "003", "1"]);
    expect(rows.find((row) => row.id === "001")?.asesor).toBe("Anterior");
    expect(rows.find((row) => row.id === "1")?.checked_in_at).toBeNull();
    expect(reportRows(employees, [], []).map((row) => row.id)).toEqual(["001", "1"]);
  });

  it("searches all employee fields without accents and sorts dates without changing its input", () => {
    const rows = reportRows(employees, attendance, []);
    expect(rows.filter((row) => searchReport(row, "angela")).map((row) => row.id)).toEqual(["001"]);
    expect(rows.filter((row) => searchReport(row, "ensenada")).map((row) => row.id)).toEqual(["1"]);
    expect(sortReport(rows, "recent").map((row) => row.id)).toEqual(["003", "001", "1"]);
    expect(sortReport(rows, "name").map((row) => row.id)).toEqual(["001", "1", "003"]);
    expect(rows[0]?.id).toBe("001");
  });

  it("calculates coverage against current active IDs even when advisors change or attendees become inactive", () => {
    expect(advisorSummary(employees, attendance, [])).toEqual([
      { name: "", total: 0, count: 1, pending: 0, percent: 0 },
      { name: "Anterior", total: 0, count: 1, pending: 0, percent: 0 },
      { name: "Ana", total: 2, count: 0, pending: 1, percent: 50 },
    ]);
  });

  it("exports separate complete and filtered sheets with string IDs and text cells", () => {
    const maliciousName = '=HYPERLINK("https://example.test")';
    const records = [{ ...attendance[0]!, nombre: maliciousName }];
    const pending = reportRows(employees, records, []).filter((row) => !row.checked_in_at);
    const sheets = reportWorkbook(event, employees, records, [], pending);
    expect(sheets).toHaveLength(5);
    expect(sheets[1]).toHaveLength(2);
    expect(sheets[2]?.[1]?.[0]).toEqual({ value: "001", type: String });
    expect(sheets[2]?.[1]?.[1]).toEqual({ value: maliciousName, type: String });
    expect(sheets[3]?.[1]?.[0]?.value).toBe("1");
    expect(sheets[2]?.[0]?.map((cell) => cell?.value)).toEqual([
      "ID_Empleado",
      "Nombre",
      "Tienda",
      "Plaza",
      "Región",
      "Asesor",
      "Posición",
      "Hora_Registro",
      "Estado",
    ]);
    expect(reportWorkbook(event, [], [], [], []).map((sheet) => sheet.length)).toEqual([
      9, 1, 1, 1, 1,
    ]);
  });

  it("lists scheduled employees as pending and flags attendees outside the roster", () => {
    const rows = reportRows(employees, attendance, ["1"]);
    expect(rows.map((row) => [row.id, row.unscheduled, row.checked_in_at !== null])).toEqual([
      ["001", true, true],
      ["003", true, true],
      ["1", false, false],
    ]);
    expect(reportValues(rows[0]!).at(-1)).toBe("No convocado");
    expect(reportValues(rows[2]!).at(-1)).toBe("Pendiente");
    expect(
      advisorSummary(employees, attendance, ["1"]).find((group) => group.name === "Ana"),
    ).toEqual({ name: "Ana", total: 1, count: 0, pending: 1, percent: 0 });
    const summary = reportWorkbook(event, employees, attendance, ["1"], rows)[0]!;
    expect(summary.map((row) => row[1]?.value)).toContain("Asistencias no convocadas");
  });
});
