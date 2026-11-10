"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DeleteState } from "@/components/ui/delete-button";
import { Prisma } from "@/generated/prisma/client";
import { getActionDictionary } from "@/i18n/dictionary";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  parseTaxRateId,
  validateTaxRateForm,
  type TaxRateFormState,
  type TaxRateValues,
} from "@/lib/tax-rate";

// Each action checks the permission first of all: they can be invoked with a direct POST
// without going through the page or the proxy.
const PERMISSION = "tax-rates:manage";
const ENTITY = "TAX_RATE";

const LIST_PATH = "/admin/tax-rates";
// revalidatePath uses the internal route: this way it covers both languages.
const LIST_ROUTE = "/[lang]/admin/tax-rates";

function messages() {
  return getActionDictionary().taxRates.errors;
}

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : undefined;
}

/** Known Prisma errors → form state; the rest is rethrown. */
function formError(error: unknown, values: TaxRateValues): TaxRateFormState {
  const t = messages();
  const code = prismaErrorCode(error);
  if (code === "P2002") return { errors: { name: [t.duplicate] }, values };
  if (code === "P2025") return { errors: { form: [t.notFound] }, values };
  throw error;
}

export async function createTaxRate(
  _prev: TaxRateFormState,
  formData: FormData,
): Promise<TaxRateFormState> {
  const user = await requirePermission(PERMISSION);

  const result = validateTaxRateForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      const taxRate = await tx.taxRate.create({
        data: { ...result.data, createdById: user.id, updatedById: user.id },
      });
      await audit(tx, {
        action: "CREATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: taxRate.id,
        after: taxRate,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

export async function updateTaxRate(
  id: number,
  _prev: TaxRateFormState,
  formData: FormData,
): Promise<TaxRateFormState> {
  const user = await requirePermission(PERMISSION);

  // The id is bound from the client: do not trust the type.
  const taxRateId = parseTaxRateId(id);
  if (taxRateId === null) return { errors: { form: [messages().invalid] } };

  const result = validateTaxRateForm(formData, messages());
  if (!result.ok) return result.state;

  try {
    await db.$transaction(async (tx) => {
      // findUniqueOrThrow throws P2025 if it no longer exists, just like the update.
      const before = await tx.taxRate.findUniqueOrThrow({
        where: { id: taxRateId },
      });
      const after = await tx.taxRate.update({
        where: { id: taxRateId },
        data: { ...result.data, updatedById: user.id },
      });
      await audit(tx, {
        action: "UPDATE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: taxRateId,
        before,
        after,
      });
    });
  } catch (error) {
    return formError(error, result.values);
  }

  revalidatePath(LIST_ROUTE, "page");
  redirect(LIST_PATH);
}

// No previous-state parameter: useActionState passes it but it is not used.
export async function deleteTaxRate(id: number): Promise<DeleteState> {
  const user = await requirePermission(PERMISSION);
  const t = messages();

  const taxRateId = parseTaxRateId(id);
  if (taxRateId === null) return { error: t.invalid };

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.taxRate.delete({ where: { id: taxRateId } });
      await audit(tx, {
        action: "DELETE",
        actorUserId: user.id,
        entityType: ENTITY,
        entityId: taxRateId,
        before,
      });
    });
  } catch (error) {
    const code = prismaErrorCode(error);
    // P2003: products use it (the FK includes the soft-deleted ones).
    if (code === "P2003") return { error: t.inUse };
    // P2025: it was already deleted; refreshing the list is enough.
    if (code !== "P2025") throw error;
  }

  revalidatePath(LIST_ROUTE, "page");
  return {};
}
