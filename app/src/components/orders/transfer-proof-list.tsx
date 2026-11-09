import type { ReactNode } from "react";
import { interpolate } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { formatters } from "@/i18n/format";

export type ProofRow = {
  id: string;
  file: string;
  state: "PENDING" | "VALIDATED" | "REJECTED";
  createdAt: Date;
  reviewedAt: Date | null;
  rejectReason: string | null;
  uploadedBy: string;
  reviewedBy: string | null;
};

/**
 * Comprobantes de transferencia de un pedido, del más nuevo al más viejo.
 * Sirve al cliente y al admin; `actions` agrega los controles del admin.
 */
export function TransferProofList({
  proofs,
  format,
  t,
  actions,
}: {
  proofs: ProofRow[];
  format: ReturnType<typeof formatters>;
  t: Dictionary["transfer"];
  actions?: (proof: ProofRow) => ReactNode;
}) {
  if (proofs.length === 0) {
    return <p className="mt-2 text-sm opacity-70">{t.proofNone}</p>;
  }
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {proofs.map((proof) => (
        <li
          key={proof.id}
          className="flex flex-col gap-2 rounded border border-current/20 p-3 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded border border-current/20 px-2 py-0.5">
              {t.proofStates[proof.state]}
            </span>
            <a
              href={`/media/transfers/${proof.file}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {t.viewFile}
            </a>
          </div>
          <p className="opacity-70">
            {interpolate(t.proofUploaded, {
              name: proof.uploadedBy,
              date: format.dateTime(proof.createdAt),
            })}
          </p>
          {proof.reviewedAt && proof.reviewedBy && (
            <p className="opacity-70">
              {interpolate(t.proofReviewed, {
                name: proof.reviewedBy,
                date: format.dateTime(proof.reviewedAt),
              })}
            </p>
          )}
          {proof.state === "REJECTED" && proof.rejectReason && (
            <p className="text-red-600">
              {interpolate(t.proofRejected, { reason: proof.rejectReason })}
            </p>
          )}
          {actions?.(proof)}
        </li>
      ))}
    </ul>
  );
}
