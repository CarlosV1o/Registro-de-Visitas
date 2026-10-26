import type { SheetData } from "write-excel-file";
import type { Attendance, AttendanceEvent, Employee } from "./models";
import { attendanceMetrics } from "./metrics";
import { advisorSummary, reportHeaders, reportRows, reportValues, type ReportRow } from "./reports";

function sheet(headers: string[], values: string[][]): SheetData {
  return [
    headers.map((value) => ({
      value,
      type: String,
      fontWeight: "bold",
      color: "#FFFFFF",
      backgroundColor: "#302931",
      height: 26,
    })),
    ...values.map((row) => row.map((value) => ({ value, type: String }))),
  ];
}

export function reportWorkbook(
  event: AttendanceEvent,
  employees: Employee[],
  attendance: Attendance[],
  selection: ReportRow[],
) {
  const metrics = attendanceMetrics(employees, attendance);
  const rows = reportRows(employees, attendance);

  const summary = sheet(
    ["Evento", "Indicador", "Valor"],
    [
      [event.title, "ID del evento", event.id],
      [event.title, "Generado (UTC)", new Date().toISOString()],
      [event.title, "Empleados activos", String(metrics.total)],
      [event.title, "Asistencias registradas", String(metrics.registered)],
      [event.title, "Pendientes activos", String(metrics.pending)],
      [event.title, "Porcentaje de la base activa", `${metrics.percent}%`],
      [event.title, "Zona horaria de Hora_Registro", "UTC (ISO 8601)"],
      [event.title, "Base de pendientes", "Empleados activos al generar el reporte"],
    ],
  );

  const advisors = sheet(
    ["Asesor", "Base activa", "Asistencias", "Pendientes activos", "% base activa"],
    advisorSummary(employees, attendance).map((group) => [
      group.name || "Sin asesor",
      String(group.total),
      String(group.count),
      String(group.pending),
      `${group.percent}%`,
    ]),
  );

  return [
    summary,
    sheet(reportHeaders, selection.map(reportValues)),
    sheet(reportHeaders, rows.filter((row) => row.checked_in_at !== null).map(reportValues)),
    sheet(reportHeaders, rows.filter((row) => row.checked_in_at === null).map(reportValues)),
    advisors,
  ];
}

export async function downloadWorkbook(
  event: AttendanceEvent,
  employees: Employee[],
  attendance: Attendance[],
  selection: ReportRow[],
) {
  const { default: writeXlsxFile } = await import("write-excel-file");
  await writeXlsxFile(reportWorkbook(event, employees, attendance, selection), {
    sheets: ["Resumen", "Vista filtrada", "Asistencia completa", "Pendientes", "Por asesor"],
    columns: [
      [{ width: 32 }, { width: 38 }, { width: 52 }],
      ...Array.from({ length: 3 }, () =>
        [16, 34, 22, 22, 22, 28, 24, 30, 16].map((width) => ({ width })),
      ),
      [28, 18, 18, 22, 20].map((width) => ({ width })),
    ],
    stickyRowsCount: 1,
    fileName: `reporte_${event.id}.xlsx`,
  });
}
