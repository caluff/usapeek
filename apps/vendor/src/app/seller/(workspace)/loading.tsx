export default function WorkspaceLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cargando datos de la tienda…
      </p>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
