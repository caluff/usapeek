"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

export function ProductDescription({
  description,
}: {
  description: string | null | undefined;
}) {
  const [isExpanded, setExpanded] = useState(false);
  const contentId = useId();
  const text = description?.trim() ?? "";
  const firstParagraph = text.split(/\n\s*\n/)[0] ?? "";
  const preview =
    firstParagraph.length > 240
      ? `${firstParagraph.slice(0, 240).trimEnd()}…`
      : firstParagraph;
  const canExpand = preview !== text;
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium">Descripción</p>
      <p
        id={contentId}
        className="break-words whitespace-pre-wrap text-sm text-muted-foreground"
      >
        {(isExpanded ? text : preview) || "-"}
      </p>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-primary"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          {isExpanded ? "Mostrar menos" : "Ver descripción completa"}
        </Button>
      ) : null}
    </div>
  );
}
