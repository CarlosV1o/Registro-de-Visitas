import { describe, expect, it } from "vite-plus/test";
import Papa from "papaparse";
import { attendanceCsv, employeeCsv, parseEmployees, makeCsv } from "./csv";

describe("employee imports", () => {
  it("preserves leading zeroes, Spanish details and inactive status", () => {
    const employees = parseEmployees(
      "ID,Nombre,Tienda,Plaza,Región,Asesor,Posición,Activo\n004509,María,Centro,Norte,Baja,Ana,Ventas,no",
    );

    expect(employees[0]).toEqual({
      id: "004509",
      nombre: "María",
      tienda: "Centro",
      plaza: "Norte",
      region: "Baja",
      asesor: "Ana",
      posicion: "Ventas",
      active: false,
    });
    expect(parseEmployees(employeeCsv(employees))).toEqual(employees);
  });

  it.each([
    "ID,Nombre\n001,Ana\n001,Otra",
    "ID,Nombre\n001,",
    "ID,Nombre\n001,Ana,Extra",
    "Nombre,Tienda\nAna,Centro",
    "ID,Nombre,Nombre\n001,Ana,Ana",
    "ID,Nombre,Activo\n001,Ana,tal vez",
    'ID,Nombre\n001,"sin cierre',
  ])("rejects an invalid file before returning rows: %s", (csv) => {
    expect(() => parseEmployees(csv)).toThrow();
  });
});

describe("exports", () => {
  it("retains the original attendance spreadsheet column order", () => {
    const csv = attendanceCsv([
      {
        employee_id: "004509",
        event_id: "11111111-1111-4111-8111-111111111111",
        nombre: "María",
        tienda: "Centro",
        plaza: "Norte",
        region: "Baja",
        asesor: "Ana",
        posicion: "Ventas",
        checked_in_at: "2026-10-25T18:00:00Z",
      },
    ]);

    const rows = Papa.parse<string[]>(csv).data;

    expect(rows[0]).toEqual([
      "ID_Empleado",
      "Nombre",
      "Tienda",
      "Plaza",
      "Región",
      "Asesor",
      "Posición",
      "Hora_Registro",
    ]);
    expect(rows[1]).toEqual([
      "004509",
      "María",
      "Centro",
      "Norte",
      "Baja",
      "Ana",
      "Ventas",
      "2026-10-25T18:00:00Z",
    ]);
  });

  it("neutralizes spreadsheet formulas including those hidden after whitespace", () => {
    const cells = ["=1+1", "\t=1+1", "\u0001+1", "@SUM(A1)", "004509", 'María, "Prueba"'];
    const csv = makeCsv([cells]);

    expect(Papa.parse<string[]>(csv).data[0]).toEqual(
      cells.map((cell, index) => (index < 4 ? `'${cell}` : cell)),
    );
  });
});
