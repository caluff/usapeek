import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ListSearch({
  q,
  label,
  path,
  placeholder,
  hidden,
}: {
  q: string;
  label: string;
  path: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form
      action={path}
      method="get"
      role="search"
      className="relative w-full min-w-0 md:w-52 md:shrink-0 lg:w-64"
    >
      <label className="sr-only" htmlFor="list-search">
        {label}
      </label>
      <Input
        key={q}
        id="list-search"
        name="q"
        maxLength={200}
        defaultValue={q}
        placeholder={placeholder}
        className="pr-12"
      />
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        static
        aria-label={label}
        className="absolute right-1 top-1 size-8"
      >
        <Search aria-hidden="true" strokeWidth={1.5} />
      </Button>
    </form>
  );
}
