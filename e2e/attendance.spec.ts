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

      if (!event?.is_open || id !== employee.id) {
        await route.fulfill({
          status: 400,
          json: { code: "22023", message: "Invalid registration" },
        });

        return;
      }

      body = { created: !present.has(target), nombre: employee.nombre, checked_in_at: checkedAt };
      present.add(target);
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
  await expect(page.getByText("¡Listo! Tu asistencia está registrada.")).toBeVisible();
}

test("event URLs open public registration and preserve leading zeroes", async ({ page }) => {
  const calls = await backend(page);
  await page.goto(`${base}eventos/${eventId}`);
  await expect(page.getByRole("heading", { name: "Reunión del equipo" })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveCount(0);
  await page.screenshot({ path: "test-results/registration-desktop.png", fullPage: true });
  await page.getByLabel("Número de empleado", { exact: true }).fill("004509");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("¡Listo! Tu asistencia está registrada.")).toBeVisible();
  await expect(page.getByText("María Prueba")).toBeVisible();
  await page.getByLabel("Número de empleado", { exact: true }).fill("004509");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("Tu asistencia ya estaba registrada.")).toBeVisible();
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
    .getByRole("article")
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
  await page.getByRole("button", { name: "Descargar CSV" }).click();
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

test("invalid employee gives feedback and mobile pages fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await backend(page);
  await page.goto(`${base}eventos/${eventId}`);
  await page.getByLabel("Número de empleado", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByRole("alert")).toContainText("Revisa tu número de empleado");
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
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cerrar evento" }).click();
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
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Eliminar evento", exact: true }).click();
  expect(calls.filter((path) => path.endsWith("/delete_event"))).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Capacitación de noviembre" })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Capacitación de noviembre");
    expect(dialog.message()).toContain("toda su asistencia");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Eliminar evento", exact: true }).click();
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
