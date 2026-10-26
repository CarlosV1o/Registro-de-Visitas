import Papa from "papaparse";
import { z } from "zod";
import { employeeSchema, type Attendance, type Employee } from "./models";

export const employeeHeaders = ["ID", "Nombre", "Tienda", "Plaza", "Región", "Asesor", "Posición"];

const aliases = new Map([
  ["id", "id"],
  ["idempleado", "id"],
  ["employeeid", "id"],
  ["numeroempleado", "id"],
  ["nombre", "nombre"],
  ["nombrecompleto", "nombre"],
  ["tienda", "tienda"],
  ["plaza", "plaza"],
  ["region", "region"],
  ["asesor", "asesor"],
  ["posicion", "posicion"],
  ["activo", "active"],
  ["active", "active"],
]);

function normalize(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseActive(value: string, row: number) {
  const normalized = normalize(value);

  if (["", "true", "1", "si", "yes"].includes(normalized)) return true;

  if (["false", "0", "no"].includes(normalized)) return false;

  throw new Error(`Fila ${row}: Activo debe ser sí/no, true/false o 1/0.`);
}

export function parseEmployees(text: string): Employee[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });

  if (parsed.errors.length) throw new Error(`CSV inválido: ${parsed.errors[0]?.message}`);

  const [headers, ...rows] = parsed.data;

  if (!headers || !rows.length)
    throw new Error("El archivo necesita encabezados y al menos un empleado.");

  if (rows.length > 10000) throw new Error("Importa un máximo de 10,000 empleados por archivo.");

  const columns = headers.map((header) => aliases.get(normalize(header)) ?? null);
  const recognized = columns.filter((column) => column !== null);

  if (new Set(recognized).size !== recognized.length) throw new Error("Hay columnas duplicadas.");

  if (!columns.includes("id") || !columns.includes("nombre"))
    throw new Error("Faltan las columnas ID y Nombre.");

  const seen = new Set<string>();

  return rows.map((cells, index) => {
    const rowNumber = index + 2;

    if (cells.length !== headers.length)
      throw new Error(`Fila ${rowNumber}: el número de columnas no coincide.`);

    const values = new Map<string, string>();

    columns.forEach((column, columnIndex) => {
      if (column) values.set(column, cells[columnIndex]?.trim() ?? "");
    });

    const checked = employeeSchema.safeParse({
      id: values.get("id") ?? "",
      nombre: values.get("nombre") ?? "",
      tienda: values.get("tienda") ?? "",
      plaza: values.get("plaza") ?? "",
      region: values.get("region") ?? "",
      asesor: values.get("asesor") ?? "",
      posicion: values.get("posicion") ?? "",
      active: parseActive(values.get("active") ?? "", rowNumber),
    });

    if (!checked.success)
      throw new Error(
        `Fila ${rowNumber}: ID y Nombre son obligatorios; ID admite 100 caracteres y los detalles 300.`,
      );

    if (seen.has(checked.data.id))
      throw new Error(`Fila ${rowNumber}: ID duplicado ${checked.data.id}.`);

    seen.add(checked.data.id);

    return checked.data;
  });
}

function safeCell(value: string) {
  // Quoting alone does not stop spreadsheet formulas, including formulas after control characters.
  // eslint-disable-next-line no-control-regex -- Block formulas hidden after control characters.
  return /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
}

export function makeCsv(rows: string[][]) {
  return (
    "\uFEFF" +
    Papa.unparse(
      rows.map((row) => row.map(safeCell)),
      { newline: "\r\n", quotes: true },
    )
  );
}

export function attendanceCsv(records: Attendance[]) {
  const rows = records.map((record) => [
    record.employee_id,
    record.nombre,
    record.tienda,
    record.plaza,
    record.region,
    record.asesor,
    record.posicion,
    record.checked_in_at,
  ]);

  return makeCsv([
    ["ID_Empleado", "Nombre", "Tienda", "Plaza", "Región", "Asesor", "Posición", "Hora_Registro"],
    ...rows,
  ]);
}

export function employeeCsv(records: Employee[]) {
  return makeCsv([
    [...employeeHeaders, "Activo"],
    ...records.map((record) => [
      record.id,
      record.nombre,
      record.tienda,
      record.plaza,
      record.region,
      record.asesor,
      record.posicion,
      record.active ? "sí" : "no",
    ]),
  ]);
}

export function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const importResponseSchema = z.number().int().nonnegative();
