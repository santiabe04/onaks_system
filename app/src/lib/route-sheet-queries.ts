import "server-only";
import { loadAccount } from "./account-ledger";
import { db } from "./db";
import { groupOrdersByZone } from "./orders-by-zone";
import { amountsToCollect, ROUTE_SALE_STATE } from "./route-sheet";

const NOTHING_TO_COLLECT = {
  order: "0.00",
  previousDebt: "0.00",
  total: "0.00",
};

/** Repartidores y vehículos activos, para elegir al armar una hoja. */
export async function getFleetOptions() {
  const [drivers, vehicles] = await Promise.all([
    db.driver.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.vehicle.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, plate: true },
    }),
  ]);
  return {
    drivers,
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.plate ? `${vehicle.name} (${vehicle.plate})` : vehicle.name,
    })),
  };
}

export type FleetOptions = Awaited<ReturnType<typeof getFleetOptions>>;

/**
 * Una hoja con todo lo que se muestra e imprime: paradas en orden, cliente,
 * dirección, contacto, productos, peso/volumen y cuánto cobrar en cada una.
 */
export async function getRouteSheet(number: number) {
  const sheet = await db.routeSheet.findUnique({
    where: { number },
    include: {
      driver: { select: { id: true, name: true, phone: true, userId: true } },
      closedBy: {
        select: { person: { select: { name: true, surname: true } } },
      },
      vehicle: {
        select: {
          id: true,
          name: true,
          plate: true,
          capacityKg: true,
          capacityLiters: true,
        },
      },
      stops: {
        orderBy: { position: "asc" },
        include: {
          recordedBy: {
            select: { person: { select: { name: true, surname: true } } },
          },
          payment: {
            select: { amount: true, method: true, voidedAt: true },
          },
          sale: {
            select: {
              id: true,
              number: true,
              state: true,
              total: true,
              paymentMethod: true,
              notes: true,
              address: {
                select: {
                  name: true,
                  address: true,
                  zipCode: true,
                  customerId: true,
                  customer: { select: { tradeName: true } },
                  city: {
                    select: {
                      id: true,
                      name: true,
                      state: { select: { name: true } },
                    },
                  },
                },
              },
              user: {
                select: {
                  person: {
                    select: { name: true, surname: true, phone: true },
                  },
                },
              },
              items: {
                select: {
                  productId: true,
                  quantity: true,
                  unitWeight: true,
                  unitVolume: true,
                  product: {
                    select: {
                      name: true,
                      sku: true,
                      measurementUnit: {
                        select: { name: true, allowsDecimals: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!sheet) return null;

  // Peso y volumen por parada y de la hoja (misma cuenta que "Por zona").
  const { zones, totals } = groupOrdersByZone(
    sheet.stops.map((stop) => ({
      stopId: stop.id,
      cityId: stop.sale.address.city.id,
      cityName: stop.sale.address.city.name,
      stateName: stop.sale.address.city.state.name,
      paymentMethod: stop.sale.paymentMethod,
      total: stop.sale.total,
      items: stop.sale.items,
    })),
  );
  const load = new Map(
    zones.flatMap((zone) =>
      zone.orders.map((order) => [
        order.stopId,
        { weight: order.weight, volume: order.volume },
      ]),
    ),
  );

  // Cuánto cobrar: lo que falta de cada pedido + la deuda anterior del cliente.
  const customerIds = [
    ...new Set(sheet.stops.map((stop) => stop.sale.address.customerId)),
  ];
  const accounts = new Map(
    await Promise.all(
      customerIds.map(
        async (id) => [id, (await loadAccount(db, id)).summary] as const,
      ),
    ),
  );
  // Solo las paradas pendientes: en las cargadas ya se cobró (o no) y la
  // deuda anterior va en la primera pendiente de cada cliente.
  const collect = amountsToCollect(
    sheet.stops
      .filter((stop) => stop.status === "PENDING")
      .map((stop) => {
        const account = accounts.get(stop.sale.address.customerId)!;
        return {
          stopId: stop.id,
          customerId: stop.sale.address.customerId,
          salePending: account.sales[stop.sale.id]?.pending ?? "0",
          customerBalance: account.balance,
        };
      }),
  );

  return {
    ...sheet,
    stops: sheet.stops.map((stop) => ({
      ...stop,
      load: load.get(stop.id) ?? { weight: "0", volume: "0" },
      collect: collect[stop.id] ?? NOTHING_TO_COLLECT,
      customerBalance:
        accounts.get(stop.sale.address.customerId)?.balance ?? "0",
    })),
    totals,
  };
}

/** Pedidos que se pueden sumar: listos para despachar y sin hoja abierta. */
export async function getRouteCandidates() {
  return db.sale.findMany({
    where: {
      state: ROUTE_SALE_STATE,
      routeStops: { none: { routeSheet: { state: { not: "CLOSED" } } } },
    },
    orderBy: [{ address: { city: { name: "asc" } } }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      total: true,
      address: {
        select: {
          name: true,
          customer: { select: { tradeName: true } },
          city: { select: { name: true } },
        },
      },
    },
  });
}

/**
 * Las hojas en reparto que ve quien carga las paradas: las del repartidor
 * vinculado a su usuario o, para un admin, todas.
 */
export async function getDeliverySheets(user: {
  id: string;
  canManage: boolean;
}) {
  const sheets = await db.routeSheet.findMany({
    where: {
      state: "OUT",
      ...(user.canManage ? {} : { driver: { userId: user.id } }),
    },
    orderBy: [{ date: "asc" }, { number: "asc" }],
    select: {
      number: true,
      date: true,
      driver: { select: { name: true } },
      stops: { select: { status: true } },
    },
  });
  return sheets.map((sheet) => ({
    ...sheet,
    done: sheet.stops.filter((stop) => stop.status !== "PENDING").length,
    total: sheet.stops.length,
  }));
}

/** Si el usuario puede cargar las paradas de esta hoja. */
export function canRecordSheet(
  sheet: { driver: { userId: string | null } },
  user: { id: string; canManage: boolean },
): boolean {
  return user.canManage || sheet.driver.userId === user.id;
}
