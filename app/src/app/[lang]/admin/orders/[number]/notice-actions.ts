"use server";

import { revalidatePath } from "next/cache";
import { getActionDictionary } from "@/i18n/dictionary";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCuid } from "@/lib/ids";
import { flushOrderNotices } from "@/lib/order-notice-ledger";

export type NoticeActionState = { error?: string };

/** Vuelve a poner en cola un aviso que falló (o quedó en cola) y lo intenta de inmediato. */
export async function retryOrderNotice(
  noticeId: string,
): Promise<NoticeActionState> {
  await requirePermission("sales:manage");
  const t = getActionDictionary().orderNotices.errors;
  if (!isCuid(noticeId)) return { error: t.notFound };
  const reset = await db.orderNotification.updateMany({
    where: { id: noticeId, status: { not: "SENT" } },
    data: { status: "PENDING", attempts: 0, claimedAt: null },
  });
  if (reset.count === 0) return { error: t.notFound };
  await flushOrderNotices();
  revalidatePath("/[lang]/admin/orders", "layout");
  return {};
}
