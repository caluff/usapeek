import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { statusLabel, PAGE_SIZE } from "./presentation";
import { FeedbackToast } from "@/components/feedback-toast";
import { RetryRead } from "./retry-read";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={`${eyebrow ? "mt-2 " : ""}font-display text-3xl tracking-tight`}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function DataError({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  return (
    <Card>
      <FeedbackToast feedback={{ status: "error", message }} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="size-4 text-warning" aria-hidden="true" />
          No pudimos cargar esta información
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="alert" className="text-sm leading-6 text-muted-foreground">
          {message}
        </p>
        <RetryRead onRetry={onRetry} isRetrying={isRetrying} />
      </CardContent>
    </Card>
  );
}

export function DataEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <PackageSearch className="mb-4 size-7 text-primary" aria-hidden="true" />
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  return (
    <Badge
      variant={
        status === "published" ||
        status === "completed" ||
        status === "confirmed" ||
        status === "open"
          ? "success"
          : status === "proposed" ||
              status === "pending" ||
              status === "requires_action"
            ? "warning"
            : status === "canceled"
              ? "destructive"
              : "muted"
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}

export function SearchForm({
  q,
  label,
  hidden,
}: {
  q: string;
  label: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="w-full space-y-2 sm:max-w-sm">
        <Label htmlFor="search">{label}</Label>
        <Input
          id="search"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={q}
          placeholder="Buscar…"
          className="h-11"
        />
      </div>
      <Button type="submit" variant="outline" className="h-11">
        Buscar
      </Button>
    </form>
  );
}

export function Pagination({
  path,
  page,
  count,
  q,
  filters,
}: {
  path: string;
  page: number;
  count: number;
  q?: string;
  filters?: Record<string, string>;
}) {
  const href = (value: number) =>
    `${path}?${new URLSearchParams({ ...filters, page: String(value), ...(q ? { q } : {}) })}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-6 py-4">
      <p className="text-xs text-muted-foreground">
        {count} resultados · Página {page} de{" "}
        {Math.max(1, Math.ceil(count / PAGE_SIZE))}
      </p>
      <nav className="flex gap-2" aria-label="Paginación">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Anterior</Link>
          </Button>
        ) : null}
        {page * PAGE_SIZE < count ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Siguiente</Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}
