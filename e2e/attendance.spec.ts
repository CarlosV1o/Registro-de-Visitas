import JSZip from "jszip";
import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";

const eventId = "11111111-1111-4111-8111-111111111111";
const secondId = "44444444-4444-4444-8444-444444444444";

const employee = {
  id: "004509",
  nombre: "María Prueba",
  tienda: "Centro",
  plaza: "Norte",
  region: "Baja",
  asesor: "Ana",
  posicion: "Ventas",
};

const checkedAt = "2026-10-25T18:00:00Z";
const base = process.env.STATIC_PREVIEW ? "/Registro-de-Visitas/" : "/";

const policyErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  policyErrors.length = 0;
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|violates.*policy/i.test(message.text())
    )
      policyErrors.push(message.text());
  });
});

test.afterEach(() => {
  expect(policyErrors, "The browser must not block application scripts with CSP").toEqual([]);
});

async function backend(page: Page, role = "admin", isOpen = true) {
  const calls: string[] = [];
  const present = new Set<string>();

  const events = [
    { id: eventId, title: "Reunión del equipo", is_open: isOpen, created_at: checkedAt },
    { id: secondId, title: "Capacitación de noviembre", is_open: true, created_at: checkedAt },
  ];

  await page.route("https://attendance-test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    calls.push(path);
    let body;

    if (path.endsWith("/token"))
      body = {
        access_token: "browser-test-token",
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: eventId, email: "operador@example.test", aud: "authenticated" },
      };
    else if (path.endsWith("/user"))
      body = { id: eventId, email: "operador@example.test", aud: "authenticated" };
    else if (path.endsWith("/current_role")) body = role;
    else if (path.endsWith("/event_info"))
      body = events.find((event) => event.id === request.postDataJSON().target_event) ?? null;
    else if (path.endsWith("/register_attendance")) {
      const { target_event: target, target_employee: id } = request.postDataJSON();
      const event = events.find((entry) => entry.id === target);

      if (event?.is_open && id === employee.id) present.add(target);
      body = { accepted: true };
    } else if (path.endsWith("/delete_event")) {
      const target = request.postDataJSON().target_event;
      const index = events.findIndex((entry) => entry.id === target);

      if (index >= 0) events.splice(index, 1);
      present.delete(target);
      body = null;
    } else if (path.endsWith("/events")) {
      if (request.method() === "POST") {
        const created = {
          id: "66666666-6666-4666-8666-666666666666",
          title: request.postDataJSON().title,
          is_open: true,
          created_at: checkedAt,
        };

        events.unshift(created);
        body = created;
      } else if (request.method() === "PATCH") {
        const event = events.find(
          (entry) => entry.id === url.searchParams.get("id")?.replace("eq.", ""),
        );

        if (event) Object.assign(event, request.postDataJSON());
        await route.fulfill({ status: 204 });

        return;
      } else
        body = url.searchParams.has("id")
          ? (events.find((event) => event.id === url.searchParams.get("id")?.replace("eq.", "")) ??
            null)
          : events;
    } else if (path.endsWith("/employees")) body = [{ ...employee, active: true }];
    else if (path.endsWith("/attendance")) {
      const target = url.searchParams.get("event_id")?.replace("eq.", "") ?? "";
      body = present.has(target)
        ? [{ ...employee, event_id: target, employee_id: employee.id, checked_in_at: checkedAt }]
        : [];
    } else if (path.endsWith("/logout")) body = {};
    else throw new Error(`Unexpected request: ${path}`);

    await route.fulfill({ json: body });
  });

  return calls;
}

async function login(page: Page, path = "admin") {
  await page.goto(base + path);
  const emailInput = page.getByLabel("Correo electrónico");

  await expect(emailInput.or(page.locator(".admin-workspace"))).toBeVisible();

  if (!(await emailInput.isVisible())) return;

  await emailInput.fill("operador@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("example-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function register(page: Page, target = eventId) {
  await page.goto(`${base}eventos/${target}`);
  await page.getByLabel("Número de empleado", { exact: true }).fill(employee.id);
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("Solicitud recibida", { exact: true })).toBeVisible();
}

test("event URLs open public registration and preserve leading zeroes", async ({ page }) => {
  const calls = await backend(page);
  await page.goto(`${base}eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "Reunión del equipo" })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveCount(0);
  await page.screenshot({ path: "test-results/registration-desktop.png", fullPage: true });
  await page.getByLabel("Número de empleado", { exact: true }).fill("004509");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("Solicitud recibida", { exact: true })).toBeVisible();
  await expect(page.getByText("María Prueba")).toHaveCount(0);
  await page.getByLabel("Número de empleado", { exact: true }).fill("004509");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("Solicitud recibida", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reunión del equipo" })).toBeVisible();
  expect(
    calls.every((path) => path.endsWith("/event_info") || path.endsWith("/register_attendance")),
  ).toBe(true);
});

test("the same employee registers independently for two event links and reports stay isolated", async ({
  page,
}) => {
  await backend(page);
  await register(page);
  await login(page, `admin/eventos/${eventId}`);
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "Todos los eventos" }).click();
  await page.getByRole("heading", { name: "Capacitación de noviembre" }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`${secondId}$`));
  await expect(page.getByText("Aún no hay asistencias")).toBeVisible();
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(0);
  await register(page, secondId);
  await login(page, `admin/eventos/${secondId}`);
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(1);
});

test("admin deep links require authentication and staff cannot load reports", async ({ page }) => {
  const calls = await backend(page, "staff");
  await page.goto(`${base}admin/eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(calls).toEqual([]);
  await login(page, `admin/eventos/${eventId}`);
  await expect(page.getByRole("alert")).toHaveText(
    "Esta cuenta no tiene permisos de administración.",
  );
  expect(
    calls.some(
      (path) =>
        path.endsWith("/attendance") || path.endsWith("/employees") || path.endsWith("/events"),
    ),
  ).toBe(false);
});

test("admins create events, copy individual links, navigate and sign out", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await backend(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  await page.screenshot({ path: "test-results/events-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  await page.getByLabel("Nombre del evento", { exact: true }).fill("Nueva reunión");
  await page.getByRole("button", { name: "Crear evento", exact: true }).click();

  const card = page
    .getByRole("row")
    .filter({ has: page.getByRole("heading", { name: "Nueva reunión" }) });

  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(card.getByRole("status")).toHaveText("Enlace copiado");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL(`${base}eventos/66666666-6666-4666-8666-666666666666`, page.url()).href,
  );
  await card.getByRole("link", { name: "Ver asistencia" }).click();
  await expect(page.getByRole("heading", { name: "Nueva reunión" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lista de asistencia" })).toHaveCount(0);
});

test("export contains all records for the event even with a list filter", async ({ page }) => {
  await backend(page);
  await register(page);
  await login(page, `admin/eventos/${eventId}`);
  await expect(page.getByRole("cell", { name: "004509" })).toBeVisible();
  await page.screenshot({ path: "test-results/attendance-desktop.png", fullPage: true });
  await page.getByLabel("Buscar empleado").fill("nadie");
  await expect(page.getByText("Sin resultados", { exact: true })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Más opciones de reporte" }).click();
  await page.getByRole("menuitem", { name: "Descargar CSV completo" }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("004509");
  expect(csv).toContain("María Prueba");
  expect(download.suggestedFilename()).toBe(`asistencia_${eventId}.csv`);
});

test("closed and nonexistent event links cannot register", async ({ page }) => {
  await backend(page, "admin", false);
  await page.goto(`${base}eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "El registro ha terminado" })).toBeVisible();
  await expect(page.getByLabel("Número de empleado", { exact: true })).toHaveCount(0);
  await page.goto(`${base}eventos/55555555-5555-4555-8555-555555555555`);
  await expect(page.getByRole("heading", { name: "Evento no encontrado" })).toBeVisible();
});

test("unknown employees receive the same blind receipt and mobile pages fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await backend(page);
  await page.goto(`${base}eventos/${eventId}`);
  await page.getByLabel("Número de empleado", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("Solicitud recibida", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: "test-results/registration-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await login(page);
  await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  await page.screenshot({ path: "test-results/events-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin configuration preserves the event URL and closed status", async ({ page }) => {
  await backend(page);
  await login(page, `admin/eventos/${eventId}/configuracion`);
  await expect(page.getByLabel("Nombre del evento", { exact: true })).toHaveValue(
    "Reunión del equipo",
  );
  await page.getByLabel("Nombre del evento", { exact: true }).fill("Reunión actualizada");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("heading", { name: "Reunión actualizada" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar evento", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cerrar evento", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Reabrir evento" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir registro" }).click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}$`));
  await expect(page.getByRole("heading", { name: "El registro ha terminado" })).toBeVisible();
});

for (const type of ["invite", "recovery"]) {
  test(`${type} link sets a password before opening administration`, async ({ page }) => {
    await backend(page);
    await page.goto(
      base +
        "#access_token=browser-test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=" +
        type,
    );
    await expect(page.getByRole("heading", { name: "Crear contraseña" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("synthetic-password");
    await page.getByLabel("Confirmar contraseña").fill("different-password");
    await page.getByRole("button", { name: "Guardar y entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden.");
    await page.getByLabel("Confirmar contraseña").fill("synthetic-password");
    await page.getByRole("button", { name: "Guardar y entrar" }).click();
    await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  });
}

test("administrator session survives refresh and sign-out removes it", async ({ page }) => {
  await backend(page);
  await login(page, `admin/eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "Lista de asistencia" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lista de asistencia" })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lista de asistencia" })).toHaveCount(0);
});

test("event deletion requires confirmation and removes only the selected event", async ({
  page,
}) => {
  const calls = await backend(page);
  await register(page, secondId);
  await login(page, `admin/eventos/${secondId}/configuracion`);
  await expect(page.getByRole("button", { name: "Eliminar evento", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar evento", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  expect(calls.filter((path) => path.endsWith("/delete_event"))).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Capacitación de noviembre" })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar evento", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Capacitación de noviembre");
  await expect(page.getByRole("alertdialog")).toContainText("toda su asistencia");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar evento", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capacitación de noviembre" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Reunión del equipo" })).toBeVisible();
  await page.goto(`${base}eventos/${secondId}`);
  await expect(page.getByRole("heading", { name: "Evento no encontrado" })).toBeVisible();
});

test("PoC totals and advisor ranking are event-specific and support missing-advisor filters", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://attendance-test.supabase.co/rest/v1/employees*", (route) =>
    route.fulfill({
      json: [
        { ...employee, active: true },
        { ...employee, id: "000002", nombre: "Pendiente", active: true },
        { ...employee, id: "000003", nombre: "Empleado inactivo", active: false },
      ],
    }),
  );
  await page.route("https://attendance-test.supabase.co/rest/v1/attendance*", (route) => {
    const target = new URL(route.request().url()).searchParams.get("event_id")?.replace("eq.", "");

    return route.fulfill({
      json:
        target === eventId
          ? [
              {
                ...employee,
                employee_id: employee.id,
                event_id: eventId,
                checked_in_at: checkedAt,
              },
              {
                ...employee,
                employee_id: "000003",
                nombre: "Empleado inactivo",
                asesor: "",
                event_id: eventId,
                checked_in_at: checkedAt,
              },
            ]
          : [],
    });
  });
  await login(page, `admin/eventos/${eventId}`);
  const metrics = page.getByLabel("Resumen del evento");
  await expect(
    metrics
      .locator(".metric-card")
      .filter({ has: page.getByText("Empleados activos", { exact: true }) })
      .locator("dd"),
  ).toHaveText("2");
  await expect(
    metrics
      .locator(".metric-card")
      .filter({ has: page.getByText("Asistencias registradas", { exact: true }) })
      .locator("dd"),
  ).toHaveText("2");
  await expect(
    metrics
      .locator(".metric-card")
      .filter({ has: page.getByText("Pendientes", { exact: true }) })
      .locator("dd"),
  ).toHaveText("1");
  await expect(metrics.getByText("50% de la base activa")).toBeVisible();
  await page.getByRole("button", { name: /Asistencia por asesor/ }).click();
  await expect(page.getByRole("button", { name: /Ana.*1 asistencia/ })).toBeVisible();
  await page.getByRole("button", { name: /Sin asesor.*1 asistencia/ }).click();
  await expect(page.getByRole("cell", { name: "Empleado inactivo", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "María Prueba", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Quitar filtro" }).click();
  await expect(page.getByRole("cell", { name: "María Prueba", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/event-metrics-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/event-metrics-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Todos los eventos" }).click();
  await page.getByRole("heading", { name: "Capacitación de noviembre" }).getByRole("link").click();
  await expect(
    metrics
      .locator(".metric-card")
      .filter({ has: page.getByText("Asistencias registradas", { exact: true }) })
      .locator("dd"),
  ).toHaveText("0");
  await expect(
    metrics
      .locator(".metric-card")
      .filter({ has: page.getByText("Pendientes", { exact: true }) })
      .locator("dd"),
  ).toHaveText("2");
  await expect(page.locator(".advisor-panel")).toHaveCount(0);
});

test("pending reports filter across employee fields and export a complete Excel workbook", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://attendance-test.supabase.co/rest/v1/employees*", (route) =>
    route.fulfill({
      json: [
        { ...employee, active: true },
        {
          ...employee,
          id: "000002",
          nombre: "Ángela Pendiente",
          tienda: "Centro",
          region: "Norte",
          plaza: "Tijuana",
          active: true,
        },
        { ...employee, id: "000003", nombre: "Inactivo", active: false },
      ],
    }),
  );
  await register(page);
  await login(page, `admin/eventos/${eventId}`);
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  await expect(page.getByRole("cell", { name: "000002", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "000003", exact: true })).toHaveCount(0);
  await page.getByLabel("Buscar empleado").fill("angela");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por región").click();
  await page.getByRole("option", { name: "Norte", exact: true }).click();
  await page.getByLabel("Filtrar por plaza").click();
  await page.getByRole("option", { name: "Tijuana", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Ángela Pendiente", exact: true })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar Excel", exact: true }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) chunks.push(chunk);

  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const workbook = await zip.file("xl/workbook.xml")!.async("string");
  expect(workbook).toContain('name="Resumen"');
  expect(workbook).toContain('name="Vista filtrada"');
  expect(workbook).toContain('name="Asistencia completa"');
  expect(workbook).toContain('name="Pendientes"');
  expect(workbook).toContain('name="Por asesor"');
  const filteredSheet = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  expect(filteredSheet.match(/<row /g)).toHaveLength(2);
  expect(download.suggestedFilename()).toBe(`reporte_${eventId}.xlsx`);
  const viewDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Más opciones de reporte" }).click();
  await page.getByRole("menuitem", { name: "Descargar vista CSV", exact: true }).click();
  const viewStream = await (await viewDownload).createReadStream();
  const viewChunks = [];

  for await (const chunk of viewStream) viewChunks.push(chunk);

  const csv = Buffer.concat(viewChunks).toString("utf8");
  expect(csv).toContain("000002");
  expect(csv).not.toContain("004509");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("reports paginate, reset to page one after filtering and print every matching row", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://attendance-test.supabase.co/rest/v1/employees*", (route) =>
    route.fulfill({
      json: Array.from({ length: 32 }, (_, index) => ({
        ...employee,
        id: String(index).padStart(6, "0"),
        nombre: `Empleado ${String(index).padStart(2, "0")}`,
        active: true,
      })),
    }),
  );
  await login(page, `admin/eventos/${eventId}`);
  await page.getByRole("tab", { name: /^Pendientes/ }).click();
  await expect(page.locator(".attendance-panel .table-scroll tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(page.locator(".attendance-panel .table-scroll tbody tr")).toHaveCount(7);
  await page.getByLabel("Buscar empleado").fill("Empleado 01");
  await expect(page.getByRole("cell", { name: "Empleado 01", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtro" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-table")).toBeVisible();
  await expect(page.locator(".print-table tbody tr")).toHaveCount(32);
  await expect(page.locator(".attendance-panel .table-scroll")).toBeHidden();
  await expect(page.locator(".admin-sidebar")).toBeHidden();
});

test("employee directory supports status filters, search and mobile administration", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://attendance-test.supabase.co/rest/v1/employees*", (route) =>
    route.fulfill({
      json: [
        { ...employee, active: true },
        { ...employee, id: "000002", nombre: "Inactivo", active: false },
      ],
    }),
  );
  await login(page, "admin/empleados");
  await expect(page.getByRole("heading", { name: "Directorio de empleados" })).toBeVisible();
  await page.getByLabel("Estado del empleado").click();
  await page.getByRole("option", { name: "Inactivos", exact: true }).click();
  await expect(page.locator("td.employee-name").filter({ hasText: /^Inactivo$/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(0);
  await page.getByLabel("Estado del empleado").click();
  await page.getByRole("option", { name: "Todos los empleados", exact: true }).click();
  await page.getByLabel("Buscar en el directorio").fill("004509");
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/employees-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/employees-mobile.png", fullPage: true });
});

test("admin navigation preserves the shell and does not recheck access between pages", async ({
  page,
}) => {
  const calls = await backend(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  await page.locator(".admin-sidebar").evaluate((element) => {
    element.setAttribute("data-navigation-marker", "persistent");
  });
  await page.getByRole("link", { name: "Empleados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Directorio de empleados" })).toBeVisible();
  await expect(page.locator(".admin-sidebar")).toHaveAttribute(
    "data-navigation-marker",
    "persistent",
  );
  await page.getByRole("link", { name: "Eventos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mis eventos" })).toBeVisible();
  await expect(page.locator(".admin-sidebar")).toHaveAttribute(
    "data-navigation-marker",
    "persistent",
  );
  expect(calls.filter((path) => path.endsWith("/current_role"))).toHaveLength(1);
});

test("search fields leave room for icons and select menus stay below their triggers", async ({
  page,
}) => {
  await backend(page);
  await login(page);
  const input = page.getByLabel("Buscar evento");

  const spacing = await input.evaluate((element) => {
    const icon = element.parentElement!.querySelector("svg")!;
    const inputBox = element.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();

    return inputBox.left + Number.parseFloat(getComputedStyle(element).paddingLeft) - iconBox.right;
  });

  expect(spacing).toBeGreaterThanOrEqual(6);
  const trigger = page.getByLabel("Filtrar eventos por estado");
  await trigger.click();
  await expect(page.getByRole("option", { name: "Cerrados", exact: true })).toBeVisible();

  const outlineWidth = await page
    .getByRole("option", { name: "Todos los estados", exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);

      // Browsers report the default medium width even when no outline is drawn.
      return style.outlineStyle === "none" ? 0 : Number.parseFloat(style.outlineWidth);
    });

  expect(outlineWidth).toBeLessThan(3);
  const triggerBox = await trigger.boundingBox();
  const contentBox = await page.getByRole("listbox").boundingBox();
  expect(contentBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  await page.screenshot({ path: "test-results/event-status-menu.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Nuevo evento", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Nombre del evento", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Nuevo evento", exact: true })).toBeFocused();
});

test("employee import validates before writing and previews the selected file", async ({
  page,
}) => {
  await backend(page);
  let writes = 0;
  await page.route(
    "https://attendance-test.supabase.co/rest/v1/rpc/import_employees",
    async (route) => {
      writes++;
      expect(route.request().postDataJSON().records[0].id).toBe("000007");
      await route.fulfill({ json: 1 });
    },
  );
  await login(page, "admin/empleados");
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Elegir CSV", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/employee-import-empty.png", fullPage: true });
  await dialog.getByLabel("Archivo CSV de empleados").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("ID,Nombre\n000007,\n"),
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByLabel("Archivo CSV de empleados").setInputFiles({
    name: "empleados.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "ID,Nombre,Tienda,Plaza,Región,Asesor,Posición\n000007,Persona de prueba,Centro,Tijuana,Norte,Ana,Ventas\n",
    ),
  });
  await expect(dialog.getByRole("cell", { name: "000007", exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.screenshot({ path: "test-results/employee-import-preview.png", fullPage: true });
  await dialog.getByRole("button", { name: "Confirmar 1 empleados", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("1 empleados importados");
  expect(writes).toBe(1);
});

test("failed event changes remain in the confirmation dialog and can be retried", async ({
  page,
}) => {
  await backend(page);
  let fail = true;
  await page.route("https://attendance-test.supabase.co/rest/v1/events*", async (route) => {
    if (route.request().method() === "PATCH" && fail) {
      fail = false;
      await route.fulfill({ status: 500, json: { message: "Synthetic failure" } });
    } else await route.fallback();
  });
  await login(page, `admin/eventos/${eventId}/configuracion`);
  await page.getByRole("button", { name: "Cerrar evento", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cerrar evento", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("No se pudo actualizar el evento");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar evento", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reabrir evento", exact: true })).toBeVisible();
});

test("public check-in handles server rate limits without revealing an employee", async ({
  page,
}) => {
  await backend(page);
  await page.route("https://attendance-test.supabase.co/rest/v1/rpc/register_attendance", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      json: { code: "PT429", message: "Too many requests" },
    }),
  );
  await page.goto(`${base}eventos/${eventId}`);
  await page.getByLabel("Número de empleado", { exact: true }).fill("004509");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByRole("alert")).toContainText("límite de solicitudes");
  await expect(page.getByText("María Prueba", { exact: true })).toHaveCount(0);
});

test("embedded pages do not expose a clickable admin interface", async ({ page }) => {
  await backend(page);
  const parentUrl = "http://127.0.0.1:4173/__frame-test__";
  await page.route(parentUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.goto(parentUrl);
  await page.evaluate(
    (path) => {
      const frame = document.createElement("iframe");
      frame.src = path;
      document.body.append(frame);
    },
    new URL(`${base}admin`, "http://127.0.0.1:4173").href,
  );
  const embedded = page.frameLocator("iframe");
  await expect(embedded.getByText("Abre esta página directamente para continuar.")).toBeVisible();
  await expect(embedded.getByLabel("Correo electrónico")).toHaveCount(0);
});

test("imported employee markup is rendered as inert text", async ({ page }) => {
  await backend(page);
  const name = '<img src=x onerror="document.body.dataset.injected=1">';
  await page.route("https://attendance-test.supabase.co/rest/v1/employees*", (route) =>
    route.fulfill({ json: [{ ...employee, nombre: name, active: true }] }),
  );
  await login(page, "admin/empleados");
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await expect(page.locator(".employee-directory img")).toHaveCount(0);
  expect(await page.locator("body").getAttribute("data-injected")).toBeNull();
});

test("mobile sidebar closes after navigation and exposes the current section", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await backend(page);
  await login(page);
  await page.getByRole("button", { name: "Mostrar navegación", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Navegación", exact: true });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Empleados", exact: true }).click();
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("heading", { name: "Directorio de empleados" })).toBeVisible();
  await page.getByRole("button", { name: "Mostrar navegación", exact: true }).click();
  await expect(navigation.getByRole("link", { name: "Empleados", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
});

test("visible form controls use the shared shadcn primitives", async ({ page }) => {
  await backend(page);
  await login(page, `admin/eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "Lista de asistencia" })).toBeVisible();

  const legacy = await page
    .locator("button:visible, input:visible, select:visible, textarea:visible")
    .evaluateAll((elements) =>
      elements
        .filter((element) => !element.hasAttribute("data-slot"))
        .map((element) => element.outerHTML),
    );

  expect(legacy).toEqual([]);
});
