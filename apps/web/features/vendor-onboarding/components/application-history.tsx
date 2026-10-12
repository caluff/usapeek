"use client"

import type { ApplicationNotificationsResponse } from "@usapeek/vendor-onboarding-contracts"
import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { FeedbackToast } from "@/components/feedback-toast"
import { readApplicationNotificationsAction } from "../actions"
import { formatApplicationEventDate, STATUS_LABELS } from "../presentation"
import type { Feedback } from "../types"

export function ApplicationHistory({
  data,
}: {
  data: ApplicationNotificationsResponse
}) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const unread = data.notifications
    .filter((item) => !item.read_at)
    .map((item) => item.id)
  return (
    <section
      className="mt-10 border-t border-border pt-8"
      aria-label="Historial de la solicitud"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium">Novedades de tu solicitud</h2>
        {unread.length ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await readApplicationNotificationsAction({
                    notification_ids: unread,
                  })
                  setFeedback(result)
                } catch {
                  setFeedback({
                    status: "error",
                    message: "No pudimos actualizar las notificaciones.",
                  })
                }
              })
            }
          >
            {pending ? "Actualizando…" : "Marcar esta página como leída"}
          </Button>
        ) : null}
      </div>
      {data.notifications.length ? (
        <ol className="space-y-5">
          {data.notifications.map((item) => (
            <li key={item.id} className="border-l-2 border-border pl-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {STATUS_LABELS[item.type]}
                </h3>
                {!item.read_at ? (
                  <span className="bg-brand-accent/10 px-2 py-1 text-xs font-semibold">
                    Nueva
                  </span>
                ) : null}
              </div>
              <time
                dateTime={item.created_at}
                className="mt-1 block text-xs text-muted-foreground"
              >
                {formatApplicationEventDate(item.created_at)}
              </time>
              {item.reason ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {item.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay novedades. Aquí aparecerán el envío y las decisiones
          sobre tu solicitud.
        </p>
      )}
      <FeedbackToast feedback={feedback} />
      {data.count > data.limit ? (
        <nav
          aria-label="Páginas del historial"
          className="mt-6 flex items-center gap-4"
        >
          {data.offset > 0 ? (
            <Button asChild variant="outline">
              <Link
                href={`/account/sell?offset=${Math.max(0, data.offset - data.limit)}`}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {data.offset + 1}–{Math.min(data.offset + data.limit, data.count)}{" "}
            de {data.count}
          </span>
          {data.offset + data.limit < data.count ? (
            <Button asChild variant="outline">
              <Link href={`/account/sell?offset=${data.offset + data.limit}`}>
                Siguiente
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
