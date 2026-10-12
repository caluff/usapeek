"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { notifyFeedback } from "@/lib/feedback";
import {
  createUnsavedFormTracker,
  readFormValues,
  shouldGuardLink,
} from "./unsaved-form-values";
import {
  browserTraversalNavigation,
  guardUnsavedTraversals,
} from "./unsaved-navigation";

type Guard = { dirty: boolean; form?: RefObject<HTMLFormElement | null> };
type UnsavedChangesContextValue = {
  hasChanges: boolean;
  update: (id: string, guard: Guard | null) => void;
  confirmDiscard: (action: () => void, dirty: boolean) => void;
  confirmDiscardWithin: (action: () => void, region: HTMLElement | null) => void;
};
const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, Guard>());
  const action = useRef<(() => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const bypassControl = useRef<HTMLElement | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const update = useCallback((id: string, guard: Guard | null) => {
    if (guard) guards.current.set(id, guard);
    else guards.current.delete(id);
    setHasChanges(Array.from(guards.current.values()).some((item) => item.dirty));
  }, []);
  const confirmDiscard = useCallback((next: () => void, dirty: boolean) => {
    if (!dirty) {
      next();
      return;
    }
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    action.current = next;
    setIsConfirming(true);
  }, []);
  const confirmDiscardWithin = useCallback(
    (next: () => void, region: HTMLElement | null) => {
      const isDirty = Array.from(guards.current.values()).some(
        (guard) =>
          guard.dirty &&
          guard.form?.current &&
          region?.contains(guard.form.current),
      );
      confirmDiscard(next, isDirty);
    },
    [confirmDiscard],
  );

  useEffect(() => {
    const navigation = browserTraversalNavigation();
    return navigation
      ? guardUnsavedTraversals(navigation, {
          isDirty: () =>
            Array.from(guards.current.values()).some((guard) => guard.dirty),
          confirmDiscard: (next) => confirmDiscard(next, true),
          onError: () =>
            notifyFeedback({
              status: "error",
              message:
                "No se pudo volver a la vista anterior. Inténtalo de nuevo.",
            }),
        })
      : undefined;
  }, [confirmDiscard]);

  useEffect(() => {
    if (!hasChanges) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!Array.from(guards.current.values()).some((guard) => guard.dirty))
        return;
      event.preventDefault();
      event.returnValue = "Hay cambios sin guardar.";
    }
    function captureClick(event: MouseEvent) {
      if (!(event.target instanceof Element) || event.defaultPrevented) return;
      const control = event.target.closest<HTMLElement>(
        "a[href], button[aria-expanded='true'][aria-controls], summary",
      );
      if (!control || control === bypassControl.current) return;
      let affected = Array.from(guards.current.values()).filter(
        (guard) => guard.dirty,
      );
      if (control instanceof HTMLAnchorElement) {
        if (
          !shouldGuardLink({
            button: event.button,
            modified:
              event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
            target: control.getAttribute("target"),
            download: control.hasAttribute("download"),
            currentUrl: window.location.href,
            href: control.href,
          })
        )
          return;
      } else {
        const region =
          control.tagName === "SUMMARY"
            ? control.closest("details[open]")
            : document.getElementById(control.getAttribute("aria-controls") ?? "");
        if (!region) return;
        affected = affected.filter((guard) =>
          guard.form?.current ? region.contains(guard.form.current) : false,
        );
      }
      if (!affected.length) return;
      event.preventDefault();
      event.stopPropagation();
      confirmDiscard(() => {
        bypassControl.current = control;
        try {
          control.click();
        } finally {
          bypassControl.current = null;
        }
      }, true);
      returnFocusRef.current = control;
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", captureClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", captureClick, true);
    };
  }, [hasChanges, confirmDiscard]);

  return (
    <UnsavedChangesContext.Provider
      value={{ hasChanges, update, confirmDiscard, confirmDiscardWithin }}
    >
      {children}
      <ConfirmationDialog
        open={isConfirming}
        onOpenChange={(open) => {
          if (!open) action.current = null;
          setIsConfirming(open);
        }}
        title="¿Descartar los cambios?"
        description="Tienes cambios sin guardar. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        cancelLabel="Seguir editando"
        returnFocusRef={returnFocusRef}
        onConfirm={() => {
          const next = action.current;
          action.current = null;
          setIsConfirming(false);
          next?.();
        }}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useHasUnsavedChanges() {
  return useContext(UnsavedChangesContext)?.hasChanges ?? false;
}

export function useConfirmDiscardWithin() {
  const context = useContext(UnsavedChangesContext);
  return (action: () => void, region: HTMLElement | null) => {
    if (context) context.confirmDiscardWithin(action, region);
    else action();
  };
}

export function useUnsavedChanges(
  isDirty: boolean,
  form?: RefObject<HTMLFormElement | null>,
) {
  const context = useContext(UnsavedChangesContext);
  const id = useId();
  const update = context?.update;
  const confirmDiscard = context?.confirmDiscard;
  useEffect(() => {
    update?.(id, { dirty: isDirty, form });
  }, [update, id, isDirty, form]);
  useEffect(() => () => update?.(id, null), [update, id]);
  return {
    markSaved: () => update?.(id, { dirty: false, form }),
    confirmDiscard: (action: () => void) => {
      if (confirmDiscard) confirmDiscard(action, isDirty);
      else action();
    },
  };
}

export function useFormUnsavedChanges(
  formRef: RefObject<HTMLFormElement | null>,
  extraState = "",
) {
  const [tracker] = useState(() => createUnsavedFormTracker(extraState));
  const extra = useRef(extraState);
  const [isDirty, setIsDirty] = useState(false);
  const guard = useUnsavedChanges(isDirty, formRef);
  const check = useCallback(() => {
    if (!formRef.current) return;
    setIsDirty(
      tracker.hasChanges(
        readFormValues(formRef.current),
        readFormValues(formRef.current, true),
        extra.current,
      ),
    );
  }, [formRef, tracker]);
  useEffect(() => {
    extra.current = extraState;
    check();
  }, [extraState, check]);
  return {
    onChange: check,
    markSaved: () => {
      if (formRef.current)
        tracker.markSaved(readFormValues(formRef.current), extra.current);
      setIsDirty(false);
      guard.markSaved();
    },
    confirmDiscard: guard.confirmDiscard,
  };
}
