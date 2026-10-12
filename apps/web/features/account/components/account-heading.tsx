export function AccountHeading({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <header className="mb-8 space-y-3 sm:mb-10">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}
