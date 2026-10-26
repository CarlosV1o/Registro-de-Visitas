import { describe, expect, it } from "vite-plus/test";
import { attendanceByAdvisor, attendanceMetrics } from "./metrics";

function employee(id: string, active = true) {
  return {
    id,
    nombre: "Empleado de prueba",
    tienda: "",
    plaza: "",
    region: "",
    asesor: "",
    posicion: "",
    active,
  };
}

function entry(id: string, asesor = "") {
  return {
    event_id: "11111111-1111-4111-8111-111111111111",
    employee_id: id,
    nombre: "Empleado de prueba",
    tienda: "",
    plaza: "",
    region: "",
    asesor,
    posicion: "",
    checked_in_at: "2026-10-25T18:00:00Z",
  };
}

describe("event attendance metrics", () => {
  it("counts pending employees by ID, preserving leading zeroes", () => {
    expect(
      attendanceMetrics([employee("001"), employee("1"), employee("003")], [entry("001")], []),
    ).toEqual({ total: 3, registered: 1, pending: 2, unscheduled: 0, percent: 33 });
  });

  it("keeps historical attendance without treating inactive attendees as active employees", () => {
    expect(
      attendanceMetrics(
        [employee("001"), employee("002", false)],
        [entry("002"), entry("003")],
        [],
      ),
    ).toEqual({ total: 1, registered: 2, pending: 1, unscheduled: 0, percent: 0 });
  });

  it("handles an empty base and a completed event without negative pending counts", () => {
    expect(attendanceMetrics([], [entry("001")], [])).toEqual({
      total: 0,
      registered: 1,
      pending: 0,
      unscheduled: 0,
      percent: 0,
    });
    expect(attendanceMetrics([employee("001")], [entry("001")], [])).toEqual({
      total: 1,
      registered: 1,
      pending: 0,
      unscheduled: 0,
      percent: 100,
    });
  });

  it("uses the event roster instead of the active base and counts unscheduled check-ins", () => {
    const base = [employee("001"), employee("002"), employee("003"), employee("004", false)];
    expect(attendanceMetrics(base, [entry("001"), entry("003")], ["001", "002", "004"])).toEqual({
      total: 3,
      registered: 2,
      pending: 2,
      unscheduled: 1,
      percent: 33,
    });
  });

  it("groups missing advisors and sorts descending, with alphabetical ties", () => {
    expect(
      attendanceByAdvisor([
        entry("001", "Zoe"),
        entry("002", "Ana "),
        entry("003", " Ana"),
        entry("004", " "),
        entry("005"),
        entry("006", "Beto"),
      ]),
    ).toEqual([
      { name: "", count: 2 },
      { name: "Ana", count: 2 },
      { name: "Beto", count: 1 },
      { name: "Zoe", count: 1 },
    ]);
  });
});
