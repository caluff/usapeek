"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notifyFeedback, withFeedbackToast } from "@/lib/feedback";
import { createCategoryAction } from "../actions";
import type { CategoryState } from "../helpers";

export function CreateCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, action, isPending] = useActionState<CategoryState, FormData>(
    async (previous, formData) => {
      try {
        const result = await withFeedbackToast(createCategoryAction)(
          previous,
          formData,
        );
        if (result.status === "success") {
          setName("");
          router.push("/dashboard/categories");
        }
        return result;
      } catch {
        const result: CategoryState = {
          status: "error",
          message:
            "No se pudo confirmar la creación. Revisa la lista antes de reintentar.",
        };
        notifyFeedback(result);
        return result;
      }
    },
    { status: "idle" },
  );

  return (
    <form
      action={action}
      className="space-y-3 border-b pb-6"
      aria-busy={isPending}
    >
      <Field>
        <FieldLabel htmlFor="new-category-name">
          Nombre de la categoría
        </FieldLabel>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="new-category-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            placeholder="Por ejemplo, Hogar"
            disabled={isPending}
            aria-describedby="new-category-help"
            className="min-w-0 sm:flex-1"
          />
          <Button type="submit" disabled={isPending || !name.trim()}>
            <Plus aria-hidden="true" />
            {isPending ? "Creando…" : "Crear categoría"}
          </Button>
        </div>
        <FieldDescription id="new-category-help">
          Disponible para los vendedores al crear o editar productos.
        </FieldDescription>
      </Field>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
