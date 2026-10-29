import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";
import type { Shortage } from "@/lib/partial-delivery";

type Numeric = { toString(): string };

/** Lo que se guarda en `route_stops.shortages`. */
type ShortageRecord = Shortage & { name: string; unit: string };

/** Lo que se cargó en una parada: para el repartidor y para el admin. */
export function StopRecordSummary({
  stop,
  t,
  methods,
  format,
}: {
  stop: {
    status: "PENDING" | "DELIVERED" | "NOT_DELIVERED";
    recordedAt: Date | null;
    recordedBy: { person: { name: string; surname: string } } | null;
    receiverName: string | null;
    receiverDni: string | null;
    signatureFile: string | null;
    photoFile: string | null;
    notDeliveredReason: string | null;
    latitude: Numeric | null;
    longitude: Numeric | null;
    /** Entrega parcial (ver `applyShortages`). */
    shortages: unknown;
    payment: {
      amount: Numeric;
      method: keyof Dictionary["orders"]["paymentMethods"];
      voidedAt: Date | null;
    } | null;
  };
  t: Dictionary["delivery"];
  methods: Dictionary["orders"]["paymentMethods"];
  format: ReturnType<typeof formatters>;
}) {
  if (stop.status === "PENDING") return null;
  const by = stop.recordedBy?.person;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-medium">
        {stop.status === "DELIVERED" ? "✓ " : "✕ "}
        {t.statuses[stop.status]}
      </p>
      {stop.recordedAt && (
        <p className="text-xs opacity-70">
          {interpolate(t.recordedAt, {
            date: format.dateTime(stop.recordedAt),
            name: by ? `${by.name} ${by.surname}` : "—",
          })}
        </p>
      )}
      {stop.notDeliveredReason && <p>{stop.notDeliveredReason}</p>}
      {stop.receiverName && (
        <p>
          {interpolate(t.receivedBy, { name: stop.receiverName })}
          {stop.receiverDni &&
            ` · ${interpolate(t.dni, { dni: stop.receiverDni })}`}
        </p>
      )}
      {Array.isArray(stop.shortages) && stop.shortages.length > 0 && (
        <div>
          <p className="font-medium">{t.partial}</p>
          <ul className="text-xs">
            {(stop.shortages as ShortageRecord[]).map((shortage) => (
              <li key={shortage.productId}>
                {interpolate(t.shortageLine, {
                  product: shortage.name,
                  delivered: format.number(shortage.delivered),
                  ordered: format.number(shortage.ordered),
                  unit: shortage.unit,
                  // En una parada solo hay RETURNED o WRITTEN_OFF.
                  reason:
                    t.shortageReasons[
                      shortage.reason as keyof typeof t.shortageReasons
                    ],
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stop.payment && !stop.payment.voidedAt && (
        <p>
          {interpolate(t.collected, {
            amount: format.money(stop.payment.amount),
            method: methods[stop.payment.method],
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {stop.signatureFile && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado, servido con sesión */}
            <img
              src={`/media/deliveries/${stop.signatureFile}`}
              alt={t.signature}
              className="h-24 rounded border border-current/20 bg-white"
            />
            <figcaption className="text-xs opacity-70">
              {t.signature}
            </figcaption>
          </figure>
        )}
        {stop.photoFile && (
          <figure>
            <a href={`/media/deliveries/${stop.photoFile}`} target="_blank">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado, servido con sesión */}
              <img
                src={`/media/deliveries/${stop.photoFile}`}
                alt={t.photoLabel}
                className="h-24 rounded border border-current/20"
              />
            </a>
            <figcaption className="text-xs opacity-70">
              {t.photoLabel}
            </figcaption>
          </figure>
        )}
      </div>
      {stop.latitude && stop.longitude && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs hover:underline"
        >
          {t.viewLocation}
        </a>
      )}
    </div>
  );
}
