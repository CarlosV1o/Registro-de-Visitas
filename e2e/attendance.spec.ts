import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";

const eventId = "11111111-1111-4111-8111-111111111111";

const employee = {
  id: "004509",
  nombre: "María Prueba",
  tienda: "Centro",
  plaza: "Norte",
  region: "Baja",
  asesor: "Ana",
  posicion: "Ventas",
  active: true,
};

const record = {
  ...employee,
  employee_id: employee.id,
  event_id: eventId,
  checked_in_at: "2026-10-25T18:00:00Z",
};

async function backend(page: Page, role = "admin", isOpen = true) {
  let checkedIn = false;

  await page.route("https://attendance-test.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
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
    else if (path.endsWith("/events"))
      body = [
        {
          id: eventId,
          title: "Reunión del equipo",
          is_open: isOpen,
          created_at: "2026-10-25T12:00:00Z",
        },
      ];
    else if (path.endsWith("/employees")) body = [employee];
    else if (path.endsWith("/attendance")) body = checkedIn ? [record] : [];
    else if (path.endsWith("/check_in")) {
      body = { created: !checkedIn, record };
      checkedIn = true;
    } else if (path.endsWith("/logout")) body = {};
    else throw new Error(`Unexpected request: ${path}`);

    await route.fulfill({ json: body });
  });
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("operador@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("example-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByLabel("Número o nombre del empleado")).toBeEnabled();
}

test("focused registration, duplicate prevention and full CSV export", async ({ page }) => {
  await backend(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "Registrar asistencia" })).toBeVisible();
  await page.screenshot({ path: "test-results/registration-desktop.png", fullPage: true });
  await expect(page.getByText("Empleados activos", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Base de empleados" })).toHaveCount(0);
  await page.getByLabel("Número o nombre del empleado").fill("004509");
  await page.getByLabel("Número o nombre del empleado").press("Enter");
  await expect(page.getByText(/María Prueba: ingreso registrado/)).toBeVisible();
  await page.getByLabel("Número o nombre del empleado").fill("004509");
  await expect(page.getByRole("button", { name: "Ya registrado" })).toBeDisabled();
  await page.getByLabel("Número o nombre del empleado").press("Enter");
  await expect(page.getByText(/María Prueba ya ingresó/)).toBeVisible();
  await page.getByRole("button", { name: /Ver asistencia/ }).click();
  await expect(page.getByRole("cell", { name: "004509", exact: true })).toHaveCount(1);
  await page.getByLabel("Buscar empleado").fill("nadie");
  await expect(page.getByText("No hay registros con estos filtros.")).toBeVisible();

  const downloading = page.waitForEvent("download");

  await page.getByRole("button", { name: "Descargar CSV" }).click();

  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) chunks.push(chunk);

  const csv = Buffer.concat(chunks).toString("utf8");

  expect(csv).toContain("004509");
  expect(csv).toContain("María Prueba");
  await page.getByText("Cuenta", { exact: true }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});

test("name search and clear feedback for an unknown employee", async ({ page }) => {
  await backend(page, "staff");
  await login(page);
  await expect(page.getByRole("button", { name: "Administración" })).toHaveCount(0);
  await page.getByLabel("Número o nombre del empleado").fill("desconocido");
  await expect(page.getByText(/No encontramos ese empleado/)).toBeVisible();
  await page.getByLabel("Número o nombre del empleado").fill("María");
  await page
    .locator(".search-results")
    .getByRole("button", { name: "Registrar", exact: true })
    .click();
  await expect(page.getByText(/María Prueba: ingreso registrado/)).toBeVisible();
});

test("closed events cannot be registered", async ({ page }) => {
  await backend(page, "staff", false);
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("operador@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("example-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Evento cerrado", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Número o nombre del empleado")).toBeDisabled();
});

test("admin tools stay separate and mobile screens do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await backend(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "Registrar asistencia" })).toBeVisible();
  await page.screenshot({ path: "test-results/registration-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Administración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Base de empleados" })).toBeVisible();
  await page.getByRole("button", { name: "Evento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administrar eventos" })).toBeVisible();
  await page.getByRole("button", { name: "Volver al registro" }).click();
  await expect(page.getByLabel("Número o nombre del empleado")).toBeVisible();
});

for (const type of ["invite", "recovery"]) {
  test(`${type} link sets a password before opening attendance`, async ({ page }) => {
    await backend(page);
    await page.goto(
      "/#access_token=browser-test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=" +
        type,
    );
    await expect(page.getByRole("heading", { name: "Crear contraseña" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registrar asistencia" })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("synthetic-password");
    await page.getByLabel("Confirmar contraseña").fill("different-password");
    await page.getByRole("button", { name: "Guardar y entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden.");
    await page.getByLabel("Confirmar contraseña").fill("synthetic-password");

    const saving = page.waitForRequest(
      (request) => request.url().endsWith("/auth/v1/user") && request.method() === "PUT",
    );

    await page.getByRole("button", { name: "Guardar y entrar" }).click();
    expect((await saving).postDataJSON()).toMatchObject({ password: "synthetic-password" });
    await expect(page.getByRole("heading", { name: "Registrar asistencia" })).toBeVisible();
  });
}

test("expired invite explains how to get another link", async ({ page }) => {
  await page.goto(
    "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(page.getByRole("alert")).toHaveText(
    "El enlace no es válido o venció. Solicita un nuevo enlace al administrador.",
  );
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});
