"use client";

import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShippingForm } from "./shipping-form";

export function CreateShippingProfile() {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isCreating, setIsCreating] = useState(false);

  function close() {
    setIsCreating(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        aria-expanded={isCreating}
        aria-controls={isCreating ? id : undefined}
        onClick={() => setIsCreating(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Crear perfil
      </Button>
      {isCreating ? (
        <div id={id} className="col-span-2 rounded-xl border bg-card p-5">
          <ShippingForm autoFocusName onSuccess={close} onCancel={close} />
        </div>
      ) : null}
    </>
  );
}
