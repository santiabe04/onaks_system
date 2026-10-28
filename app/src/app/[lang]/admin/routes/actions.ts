"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import type { RouteSheetState } from "@/generated/prisma/enums";
import { interpolate } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import {
  moveStop,
  ROUTE_SALE_STATE,
  validateRouteSheetForm,
  type RouteSheetFormState,
  type RouteSheetInput,
} from "@/lib/route-sheet";
import { summarizeCollections, validateClosingForm } from "@/lib/route-closing";
import {
  applySaleStateChange,
  StateChangeError,
} from "@/lib/sale-state-change";

// Hojas de ruta: armado (paradas y orden) y salida. Mientras está Armando se
// cambia todo; al salir, los pedidos pasan a En reparto.
const PERMISSION = "routes:manage";
const ENTITY = "ROUTE_SHEET";

export type RouteActionState = { error?: string };

/** Corta la transacción con un mensaje para el admin. */
class RouteError extends Error {}

function messages() {
  return getActionDictionary().routes.errors;
}

function revalidateRoutes() {
  // Hojas, pedidos (estados) y la vista del repartidor.
  revalidatePath("/[lang]", "layout");
}

async function run(work: () => Promise<void>): Promise<RouteActionState> {
  try {
    await work();
    return {};
  } catch (error) {
    if (error instanceof RouteError) return { error: error.message };
    throw error;
  }
}

/** Bloquea la hoja hasta el fin de la transacción y devuelve su estado. */
async function lockSheet(
  tx: Prisma.TransactionClient,
  sheetId: string,
): Promise<{ id: string; number: number; state: RouteSheetState }> {
  const t = messages();
  if (!isCuid(sheetId)) throw new RouteError(t.notFound);
  const [sheet] = await tx.$queryRaw<
    { id: string; number: number; state: RouteSheetState }[]
  >`SELECT "id", "number", "state" FROM "route_sheets" WHERE "id" = ${sheetId} FOR UPDATE`;
  if (!sheet) throw new RouteError(t.notFound);
  return sheet;
}

async function lockDraft(tx: Prisma.TransactionClient, sheetId: string) {
  const sheet = await lockSheet(tx, sheetId);
  if (sheet.state !== "DRAFT") throw new RouteError(messages().notDraft);
  return sheet;
}

/** Repartidor y vehículo tienen que existir y estar activos. */
async function checkFleet(
  tx: Prisma.TransactionClient,
  input: RouteSheetInput,
) {
  const t = messages();
  const driver = await tx.driver.findFirst({
    where: { id: input.driverId, isActive: true },
    select: { id: true },
  });
  if (!driver) throw new RouteError(t.driverInactive);
  if (input.vehicleId) {
    const vehicle = await tx.vehicle.findFirst({
      where: { id: input.vehicleId, isActive: true },
      select: { id: true },
    });
    if (!vehicle) throw new RouteError(t.vehicleInactive);
  }
}

function sheetData(input: RouteSheetInput) {
  return {
    date: new Date(`${input.date}T00:00:00Z`),
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    notes: input.notes,
  };
}

/**
 * Suma pedidos a la hoja, al final. Tienen que estar Listos para despachar y
 * no estar en otra hoja abierta (se bloquean los pedidos para chequearlo).
 */
async function addSalesToSheet(
  tx: Prisma.TransactionClient,
  sheet: { id: string },
  saleIds: string[],
) {
  const t = messages();
  if (saleIds.length === 0) throw new RouteError(t.noneSelected);
  const sales = await tx.$queryRaw<
    { id: string; number: number; state: string }[]
  >`SELECT "id", "number", "state" FROM "sales"
    WHERE "id" = ANY(${saleIds}) ORDER BY "id" FOR UPDATE`;
  for (const sale of sales) {
    if (sale.state !== ROUTE_SALE_STATE) {
      throw new RouteError(
        interpolate(t.saleNotReady, { number: sale.number }),
      );
    }
  }
  const taken = await tx.routeStop.findFirst({
    where: {
      saleId: { in: saleIds },
      routeSheet: { state: { not: "CLOSED" } },
    },
    select: {
      routeSheetId: true,
      sale: { select: { number: true } },
      routeSheet: { select: { number: true } },
    },
  });
  if (taken) {
    throw new RouteError(
      interpolate(t.saleInOtherSheet, {
        number: taken.sale.number,
        sheet: taken.routeSheet.number,
      }),
    );
  }
  const last = await tx.routeStop.aggregate({
    where: { routeSheetId: sheet.id },
    _max: { position: true },
  });
  let position = last._max.position ?? 0;
  // En el orden en que se eligieron (el de la pantalla).
  for (const id of saleIds) {
    if (!sales.some((sale) => sale.id === id)) continue;
    position += 1;
    await tx.routeStop.create({
      data: { routeSheetId: sheet.id, saleId: id, position },
    });
  }
}

function readSaleIds(formData: FormData): string[] {
  const ids: string[] = [];
  for (const raw of formData.getAll("sale")) {
    if (typeof raw !== "string") continue;
    // Desde la vista por zona llega "id:ESTADO"; desde la hoja, solo el id.
    const id = raw.split(":")[0];
    if (isCuid(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Hoja nueva, vacía: después se le agregan pedidos. */
export async function createRouteSheet(
  _prev: RouteSheetFormState,
  formData: FormData,
): Promise<RouteSheetFormState> {
  const user = await requirePermission(PERMISSION);
  const result = validateRouteSheetForm(formData, messages());
  if (!result.ok) return result.state;

  let number: number;
  try {
    number = await db.$transaction(async (tx) => {
      await checkFleet(tx, result.data);
      const sheet = await tx.routeSheet.create({
        data: {
          ...sheetData(result.data),
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        after: sheet,
      });
      return sheet.number;
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return { errors: { form: [error.message] }, values: result.values };
    }
    throw error;
  }
  revalidateRoutes();
  redirect(`/admin/routes/${number}`);
}

/** Desde "Por zona": hoja nueva con los pedidos marcados. */
export async function createRouteSheetFromSales(
  _prev: RouteSheetFormState,
  formData: FormData,
): Promise<RouteSheetFormState> {
  const user = await requirePermission(PERMISSION);
  const result = validateRouteSheetForm(formData, messages());
  if (!result.ok) return result.state;
  const saleIds = readSaleIds(formData);

  let number: number;
  try {
    number = await db.$transaction(async (tx) => {
      await checkFleet(tx, result.data);
      const sheet = await tx.routeSheet.create({
        data: {
          ...sheetData(result.data),
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await addSalesToSheet(tx, sheet, saleIds);
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        after: sheet,
        metadata: { saleIds },
      });
      return sheet.number;
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return { errors: { form: [error.message] }, values: result.values };
    }
    throw error;
  }
  revalidateRoutes();
  redirect(`/admin/routes/${number}`);
}

/** Fecha, repartidor, vehículo y comentario, mientras se arma. */
export async function updateRouteSheet(
  sheetId: string,
  _prev: RouteSheetFormState,
  formData: FormData,
): Promise<RouteSheetFormState> {
  const user = await requirePermission(PERMISSION);
  const result = validateRouteSheetForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      await lockDraft(tx, sheetId);
      await checkFleet(tx, result.data);
      const before = await tx.routeSheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      const after = await tx.routeSheet.update({
        where: { id: sheetId },
        data: { ...sheetData(result.data), updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheetId,
        before,
        after,
      });
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return { errors: { form: [error.message] }, values: result.values };
    }
    throw error;
  }
  revalidateRoutes();
  return {};
}

export async function addStops(
  sheetId: string,
  _prev: RouteActionState,
  formData: FormData,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const saleIds = readSaleIds(formData);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      await addSalesToSheet(tx, sheet, saleIds);
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        metadata: { addedSales: saleIds },
      });
    }),
  );
  revalidateRoutes();
  return state;
}

/** Quita una parada y renumera las demás. */
export async function removeStop(
  sheetId: string,
  stopId: string,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      const stop = await tx.routeStop.findFirst({
        where: { id: stopId, routeSheetId: sheet.id },
        select: { id: true, saleId: true },
      });
      if (!stop) return;
      await tx.routeStop.delete({ where: { id: stop.id } });
      await renumber(tx, sheet.id);
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        metadata: { removedSale: stop.saleId },
      });
    }),
  );
  revalidateRoutes();
  return state;
}

export async function moveStopAction(
  sheetId: string,
  stopId: string,
  direction: -1 | 1,
): Promise<RouteActionState> {
  await requirePermission(PERMISSION);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      const stops = await tx.routeStop.findMany({
        where: { routeSheetId: sheet.id },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const order = moveStop(
        stops.map((stop) => stop.id),
        stopId,
        direction === -1 ? -1 : 1,
      );
      for (const [index, id] of order.entries()) {
        await tx.routeStop.update({
          where: { id },
          data: { position: index + 1 },
        });
      }
    }),
  );
  revalidateRoutes();
  return state;
}

/** Posiciones 1, 2, 3… después de quitar una parada. */
async function renumber(tx: Prisma.TransactionClient, sheetId: string) {
  const stops = await tx.routeStop.findMany({
    where: { routeSheetId: sheetId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  for (const [index, stop] of stops.entries()) {
    await tx.routeStop.update({
      where: { id: stop.id },
      data: { position: index + 1 },
    });
  }
}

/**
 * Cambia el estado de todos los pedidos de la hoja en una transacción (todos
 * o ninguno), en orden de cliente para no cruzar bloqueos con otra hoja.
 */
async function moveSales(
  tx: Prisma.TransactionClient,
  sheetId: string,
  from: "READY_TO_SHIP" | "OUT_FOR_DELIVERY",
  to: "READY_TO_SHIP" | "OUT_FOR_DELIVERY",
  userId: string,
  comment: string,
) {
  const t = messages();
  const stateErrors = getActionDictionary().adminOrders.stateChange.errors;
  const stops = await tx.routeStop.findMany({
    where: { routeSheetId: sheetId },
    select: {
      saleId: true,
      sale: {
        select: { number: true, address: { select: { customerId: true } } },
      },
    },
  });
  if (stops.length === 0) throw new RouteError(t.noStops);
  stops.sort(
    (a, b) =>
      a.sale.address.customerId.localeCompare(b.sale.address.customerId) ||
      a.saleId.localeCompare(b.saleId),
  );
  for (const stop of stops) {
    try {
      await applySaleStateChange(
        tx,
        stop.saleId,
        { from, to, warehouseId: null, itemWarehouses: {}, comment },
        userId,
        stateErrors,
      );
    } catch (error) {
      if (!(error instanceof StateChangeError)) throw error;
      throw new RouteError(
        interpolate(t.departFailed, {
          number: stop.sale.number,
          error: error.message,
        }),
      );
    }
  }
}

/** Sale a repartir: los pedidos pasan a En reparto. */
export async function departRouteSheet(
  sheetId: string,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      await moveSales(
        tx,
        sheet.id,
        "READY_TO_SHIP",
        "OUT_FOR_DELIVERY",
        user.id,
        `#${sheet.number}`,
      );
      const after = await tx.routeSheet.update({
        where: { id: sheet.id },
        data: { state: "OUT", departedAt: new Date(), updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        before: { state: sheet.state },
        after: { state: after.state },
      });
    }),
  );
  revalidateRoutes();
  return state;
}

/** Vuelve a Armando: los pedidos vuelven a Listo para despachar. */
export async function undoDeparture(
  sheetId: string,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockSheet(tx, sheetId);
      if (sheet.state !== "OUT") throw new RouteError(messages().notOut);
      // Con paradas ya cargadas, los pedidos no están todos En reparto.
      const recorded = await tx.routeStop.count({
        where: { routeSheetId: sheet.id, status: { not: "PENDING" } },
      });
      if (recorded > 0) {
        throw new RouteError(
          getActionDictionary().delivery.errors.recordedStops,
        );
      }
      await moveSales(
        tx,
        sheet.id,
        "OUT_FOR_DELIVERY",
        "READY_TO_SHIP",
        user.id,
        `#${sheet.number}`,
      );
      await tx.routeSheet.update({
        where: { id: sheet.id },
        data: { state: "DRAFT", departedAt: null, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        before: { state: "OUT" },
        after: { state: "DRAFT" },
      });
    }),
  );
  revalidateRoutes();
  return state;
}

/** Borra una hoja que se está armando (los pedidos quedan como están). */
export async function deleteRouteSheet(
  sheetId: string,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      const before = await tx.routeSheet.findUniqueOrThrow({
        where: { id: sheet.id },
        include: { stops: true },
      });
      await tx.routeSheet.delete({ where: { id: sheet.id } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        before,
      });
    }),
  );
  if (state.error) return state;
  revalidateRoutes();
  redirect("/admin/routes");
}

/**
 * Cierra la hoja cuando volvió el repartidor: todas las paradas cargadas y
 * la rendición del efectivo cobrado (lo esperado se calcula acá, con la hoja
 * bloqueada, para que no cambie entre que se ve y se cierra).
 */
export async function closeRouteSheet(
  sheetId: string,
  _prev: RouteActionState,
  formData: FormData,
): Promise<RouteActionState> {
  const user = await requirePermission(PERMISSION);
  const t = getActionDictionary().routes.closing.errors;
  const state = await run(() =>
    db.$transaction(async (tx) => {
      const sheet = await lockSheet(tx, sheetId);
      if (sheet.state !== "OUT") throw new RouteError(t.notOut);
      const stops = await tx.routeStop.findMany({
        where: { routeSheetId: sheet.id },
        select: {
          status: true,
          payment: { select: { amount: true, method: true, voidedAt: true } },
        },
      });
      const summary = summarizeCollections(stops);
      if (summary.pendingStops > 0) throw new RouteError(t.pendingStops);
      const closing = validateClosingForm(formData, summary.cashExpected, t);
      if (!closing.ok) throw new RouteError(closing.error);

      const after = await tx.routeSheet.update({
        where: { id: sheet.id },
        data: {
          state: "CLOSED",
          closedAt: new Date(),
          closedById: user.id,
          cashExpected: summary.cashExpected,
          cashReceived: closing.data.cashReceived,
          closingNotes: closing.data.notes,
          updatedById: user.id,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: sheet.id,
        before: { state: sheet.state },
        after,
        metadata: {
          collected: summary.byMethod,
          difference: closing.data.difference,
        },
      });
    }),
  );
  revalidateRoutes();
  return state;
}
