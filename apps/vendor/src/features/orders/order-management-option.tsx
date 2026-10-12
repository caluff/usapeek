"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { SettingsOption } from "@/components/ui/settings-option";

type OrderManagementContext = {
  isBlocked: boolean;
  getIsBlocked: () => boolean;
  setBlocked: (blocked: boolean) => void;
  onSaved: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

const ManagementContext = createContext<OrderManagementContext | null>(null);

export function useOrderManagementOption() {
  return useContext(ManagementContext);
}

export function OrderManagementOption({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isBlockedRef = useRef(false);
  const context = useMemo<OrderManagementContext>(
    () => ({
      isBlocked,
      getIsBlocked: () => isBlockedRef.current,
      setBlocked: (blocked) => {
        isBlockedRef.current = blocked;
        setIsBlocked(blocked);
      },
      onSaved: () => {
        setIsOpen(false);
      },
      returnFocusRef: triggerRef,
    }),
    [isBlocked],
  );

  return (
    <div ref={containerRef}>
      <SettingsOption
        label={label}
        value={value}
        open={isOpen}
        onOpenChange={(open) => {
          if (isBlockedRef.current) return;
          if (open)
            triggerRef.current =
              containerRef.current?.querySelector<HTMLButtonElement>(
                "[data-settings-option-trigger]",
              ) ?? null;
          setIsOpen(open);
        }}
      >
        <ManagementContext.Provider value={context}>
          {isOpen ? children : null}
        </ManagementContext.Provider>
      </SettingsOption>
    </div>
  );
}
