"use client";

import { useActionState } from "react";
import { FolderPlus, LoaderCircle } from "lucide-react";
import { withFeedbackToast } from "@/lib/feedback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createProposedCategoryAction } from "../actions";

export function CategoryProposalForm({
  applicationId,
  version,
  suggestion,
}: {
  applicationId: string;
  version: number;
  suggestion: string;
}) {
  const [state, action, isPending] = useActionState(
    withFeedbackToast(createProposedCategoryAction.bind(null, applicationId)),
    { status: "idle" },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categoría propuesta</CardTitle>
        <CardDescription>
          El solicitante propone «{suggestion}». Puedes añadirla al catálogo;
          aprobar la solicitud no la crea automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4" aria-busy={isPending}>
          <input type="hidden" name="expected_version" value={version} />
          <Field>
            <FieldLabel htmlFor="proposed-category-name">
              Nombre en el catálogo
            </FieldLabel>
            <Input
              id="proposed-category-name"
              name="name"
              defaultValue={suggestion}
              required
              maxLength={120}
              disabled={isPending || state.status === "success"}
              aria-describedby="proposed-category-description"
            />
            <FieldDescription id="proposed-category-description">
              Se creará una categoría pública y activa. Esta acción es
              independiente de la decisión sobre la tienda.
            </FieldDescription>
          </Field>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending || state.status === "success"}
          >
            {isPending ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <FolderPlus className="size-4" aria-hidden="true" />
            )}
            {isPending ? "Añadiendo categoría…" : "Añadir al catálogo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
