"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/ui/form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { retryOrderNotice } from "@/app/[lang]/admin/orders/[number]/notice-actions";

/** Retries sending a notice that did not go out. */
export function NoticeRetryButton({
  noticeId,
  t,
}: {
  noticeId: string;
  t: Dictionary["orderNotices"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className="text-xs underline"
        onClick={() =>
          startTransition(async () => {
            setError((await retryOrderNotice(noticeId)).error);
          })
        }
      >
        {pending ? t.retrying : t.retry}
      </button>
      <FormError messages={error} />
    </span>
  );
}
