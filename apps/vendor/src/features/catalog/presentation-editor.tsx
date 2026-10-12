"use client";

import { createContext, useContext, type ReactNode } from "react";

const EditorContext = createContext<{
  close: () => void;
  setBusy: (busy: boolean) => void;
  open: () => void;
  canEdit: boolean;
  panelId: string;
} | null>(null);
export function PresentationEditorProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: NonNullable<ReturnType<typeof usePresentationEditor>>;
}) {
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}
export function usePresentationEditor() {
  return useContext(EditorContext);
}
