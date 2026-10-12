"use client";

import { useState } from "react";
import { SettingsOption } from "@/components/ui/settings-option";
import { AccountProfileForm } from "./profile-form";

export function AccountProfileDialog({
  firstName,
  lastName,
  returnTo,
}: {
  firstName?: string | null;
  lastName?: string | null;
  returnTo?: string;
}) {
  const [isOpen, setIsOpen] = useState(Boolean(returnTo));
  const name = [firstName, lastName].filter((part) => part?.trim()).join(" ");
  return (
    <SettingsOption
      label="Nombre y apellido"
      value={name || "Sin completar"}
      description={
        returnTo && !firstName?.trim()
          ? "Completa tu nombre para continuar."
          : "Este nombre aparecerá en tu cuenta."
      }
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AccountProfileForm
        firstName={firstName}
        lastName={lastName}
        returnTo={returnTo}
        onSaved={() => setIsOpen(false)}
      />
    </SettingsOption>
  );
}
