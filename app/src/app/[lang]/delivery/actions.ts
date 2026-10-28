"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import type { RouteStopStatus } from "@/generated/prisma/enums";
import { getActionDictionary } from "@/i18n/dictionary";
import { createCustomerPayment, lockAccount } from "@/lib/account-ledger";
import { audit } from "@/lib/audit";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  processDeliveryPhoto,
  processSignature,
  saveDeliveryFile,
} from "@/lib/delivery-files";
import { isCuid } from "@/lib/ids";
import { isoDay } from "@/lib/order-period";
import { can } from "@/lib/permissions";
import { hasUpload } from "@/lib/product-image";
import {
  applySaleStateChange,
  StateChangeError,
} from "@/lib/sale-state-change";
import { parsePartialDelivery, type Shortage } from "@/lib/partial-delivery";
import { applyShortages } from "@/lib/partial-delivery-ledger";
import { validateStopRecord } from "@/lib/stop-record";

// Carga de cada parada desde el celular: la hace el repartidor de la hoja (su
// usuario vinculado) o un admin. Entregado → el pedido pasa a Entregado (y es
// deuda); no entregado → vuelve a Listo para despachar.

export type StopActionState = { error?: string };

/** Corta la transacción con un mensaje para quien carga. */
class StopError extends Error {}

function messages() {
  return getActionDictionary().delivery.errors;
}

type LockedStop = {
  id: string;
  status: RouteStopStatus;
  saleId: string;
  sheetId: string;
  sheetNumber: number;
  sheetState: string;
  driverUserId: string | null;
  customerId: string;
};

/**
 * Bloquea la cuenta del cliente y la parada (mismo orden que cobros y
 * cambios de estado) y verifica que quien carga pueda hacerlo.
 */
async function lockStop(
  tx: Prisma.TransactionClient,
  stopId: string,
  user: SessionUser,
): Promise<LockedStop> {
  const t = messages();
  if (!isCuid(stopId)) throw new StopError(t.notFound);
  const owner = await tx.routeStop.findUnique({
    where: { id: stopId },
    select: { sale: { select: { address: { select: { customerId: true } } } } },
  });
  if (!owner) throw new StopError(t.notFound);
  const customerId = owner.sale.address.customerId;
  await lockAccount(tx, customerId);

  const [stop] = await tx.$queryRaw<Omit<LockedStop, "customerId">[]>`
    SELECT st."id", st."status", st."sale_id" AS "saleId",
           sh."id" AS "sheetId", sh."number" AS "sheetNumber", sh."state" AS "sheetState",
           d."user_id" AS "driverUserId"
    FROM "route_stops" st
    JOIN "route_sheets" sh ON sh."id" = st."route_sheet_id"
    JOIN "drivers" d ON d."id" = sh."driver_id"
    WHERE st."id" = ${stopId}
    FOR UPDATE OF st, sh`;
  if (!stop) throw new StopError(t.notFound);
  // El repartidor de la hoja, o cualquier admin (las empresas chicas reparten ellas).
  if (stop.driverUserId !== user.id && !can(user.role, "routes:manage")) {
    throw new StopError(t.notYours);
  }
  if (stop.sheetState !== "OUT") throw new StopError(t.notOut);
  return { ...stop, customerId };
}

export async function recordStop(
  stopId: string,
  _prev: StopActionState,
  formData: FormData,
): Promise<StopActionState> {
  const user = await requirePermission("routes:deliver");
  const t = messages();

  const photo = formData.get("photo");
  const hasPhoto = hasUpload(photo);
  const parsed = validateStopRecord(formData, hasPhoto, t);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.data;

  // Entrega parcial: se valida contra lo que tiene el pedido.
  let shortages: Shortage[] = [];
  // Para la parada: con nombre y unidad (el producto puede salir del pedido).
  let shortageRecord: (Shortage & { name: string; unit: string })[] = [];
  if (input.outcome === "DELIVERED" && isCuid(stopId)) {
    const items = await db.saleItem.findMany({
      where: { sale: { routeStops: { some: { id: stopId } } } },
      select: {
        productId: true,
        quantity: true,
        product: {
          select: {
            name: true,
            measurementUnit: { select: { name: true, allowsDecimals: true } },
          },
        },
      },
    });
    const partial = parsePartialDelivery(
      formData,
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        allowsDecimals: item.product.measurementUnit.allowsDecimals,
      })),
      t,
    );
    if (!partial.ok) return { error: partial.error };
    shortages = partial.shortages;
    shortageRecord = shortages.map((shortage) => {
      const item = items.find((i) => i.productId === shortage.productId)!;
      return {
        ...shortage,
        name: item.product.name,
        unit: item.product.measurementUnit.name,
      };
    });
  }

  // Las imágenes se procesan y guardan antes de la transacción (sharp tarda).
  // Si después la carga falla, quedan huérfanas en disco: no es un problema.
  let signatureFile: string | null = null;
  let photoFile: string | null = null;
  if (input.outcome === "DELIVERED") {
    if (input.signature) {
      const signature = await processSignature(input.signature);
      if (!signature.ok) return { error: t.signatureInvalid };
      signatureFile = await saveDeliveryFile(signature.data);
    }
    if (hasPhoto) {
      const image = await processDeliveryPhoto(photo as File);
      if (!image.ok) {
        return {
          error: image.error === "tooLarge" ? t.photoTooLarge : t.photoInvalid,
        };
      }
      photoFile = await saveDeliveryFile(image.data);
    }
  }

  let sheetNumber: number;
  try {
    sheetNumber = await db.$transaction(async (tx) => {
      const stop = await lockStop(tx, stopId, user);
      if (stop.status !== "PENDING") throw new StopError(t.alreadyRecorded);

      const delivered = input.outcome === "DELIVERED";
      // Primero se ajusta el pedido a lo entregado: así la deuda es por eso.
      if (delivered) {
        const sale = await tx.sale.findUniqueOrThrow({
          where: { id: stop.saleId },
          select: { id: true, number: true },
        });
        await applyShortages(tx, sale, stop.sheetNumber, shortages, user.id);
      }
      await applySaleStateChange(
        tx,
        stop.saleId,
        {
          from: "OUT_FOR_DELIVERY",
          to: delivered ? "DELIVERED" : "READY_TO_SHIP",
          warehouseId: null,
          itemWarehouses: {},
          comment: delivered
            ? `#${stop.sheetNumber}`
            : `#${stop.sheetNumber}: ${input.reason}`,
        },
        user.id,
        getActionDictionary().adminOrders.stateChange.errors,
      );

      // El cobro va a la cuenta corriente, con la fecha de hoy.
      const payment =
        delivered && input.payment
          ? await createCustomerPayment(
              tx,
              {
                customerId: stop.customerId,
                saleId: stop.saleId,
                kind: "PAYMENT",
                amount: input.payment.amount,
                method: input.payment.method,
                paidOn: isoDay(new Date()),
                notes: `#${stop.sheetNumber}`,
              },
              user.id,
            )
          : null;

      const after = await tx.routeStop.update({
        where: { id: stop.id },
        data: {
          status: input.outcome,
          recordedAt: new Date(),
          recordedById: user.id,
          receiverName: delivered ? input.receiverName : null,
          receiverDni: delivered ? input.receiverDni : null,
          signatureFile,
          photoFile,
          notDeliveredReason: delivered ? null : input.reason,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          accuracyMeters: input.location?.accuracyMeters ?? null,
          paymentId: payment?.id ?? null,
          shortages: shortageRecord.length > 0 ? shortageRecord : undefined,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "ROUTE_SHEET",
        entityId: stop.sheetId,
        after: { stop: after },
        metadata: { stopRecorded: stop.id },
      });
      return stop.sheetNumber;
    });
  } catch (error) {
    if (error instanceof StopError || error instanceof StateChangeError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  redirect(`/delivery/${sheetNumber}`);
}

/**
 * Deshace la carga de una parada (solo admins, mientras la hoja está en
 * reparto): el pedido vuelve a En reparto. Un cobro cargado queda en la
 * cuenta corriente y se anula desde ahí; firma y foto quedan en el historial.
 */
export async function undoStop(stopId: string): Promise<StopActionState> {
  const user = await requirePermission("routes:manage");
  const t = messages();

  try {
    await db.$transaction(async (tx) => {
      const stop = await lockStop(tx, stopId, user);
      if (stop.status === "PENDING") throw new StopError(t.notRecorded);
      // Revertir una entrega parcial implica pedido, stock y montos: a mano.
      const recorded = await tx.routeStop.findUniqueOrThrow({
        where: { id: stop.id },
        select: { shortages: true },
      });
      if (recorded.shortages) throw new StopError(t.partialNoUndo);
      const before = await tx.routeStop.findUniqueOrThrow({
        where: { id: stop.id },
      });
      await applySaleStateChange(
        tx,
        stop.saleId,
        {
          from: stop.status === "DELIVERED" ? "DELIVERED" : "READY_TO_SHIP",
          to: "OUT_FOR_DELIVERY",
          warehouseId: null,
          itemWarehouses: {},
          comment: `#${stop.sheetNumber}`,
        },
        user.id,
        getActionDictionary().adminOrders.stateChange.errors,
      );
      await tx.routeStop.update({
        where: { id: stop.id },
        data: {
          status: "PENDING",
          recordedAt: null,
          recordedById: null,
          receiverName: null,
          receiverDni: null,
          signatureFile: null,
          photoFile: null,
          notDeliveredReason: null,
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          paymentId: null,
        },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: "ROUTE_SHEET",
        entityId: stop.sheetId,
        before: { stop: before },
        metadata: { stopUndone: stop.id },
      });
    });
  } catch (error) {
    if (error instanceof StopError || error instanceof StateChangeError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/[lang]", "layout");
  return {};
}
