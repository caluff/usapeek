"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";

type AutocompleteProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "children"
> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  listLabel: string;
  emptyMessage: string;
  invalidMessage: string;
  blockedMessage?: string;
};

export function Autocomplete({
  id,
  value,
  onChange,
  options,
  listLabel,
  emptyMessage,
  invalidMessage,
  blockedMessage,
  disabled,
  className,
  ...props
}: AutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [wasValidated, setWasValidated] = useState(false);
  const query = value.trim().toLocaleLowerCase("en-US");
  const matches = options.filter((option) =>
    option.toLocaleLowerCase("en-US").includes(query),
  );
  const visibleOptions = matches.slice(0, 50);
  const selected = options.find(
    (option) => option.toLocaleLowerCase("en-US") === query,
  );
  const validationMessage =
    blockedMessage ||
    ((value || props.required) && !selected ? invalidMessage : "");
  const expanded = isOpen && !disabled && !blockedMessage;
  const activeOption = expanded ? visibleOptions[activeIndex] : undefined;

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationMessage);
  }, [validationMessage]);

  useEffect(() => {
    if (activeOption)
      listRef.current?.children[activeIndex]?.scrollIntoView({
        block: "nearest",
      });
  }, [activeIndex, activeOption]);

  function choose(option: string) {
    onChange(option);
    setIsOpen(false);
    setActiveIndex(-1);
    setWasValidated(false);
  }

  return (
    <div className="relative min-w-0">
      <Input
        {...props}
        ref={inputRef}
        id={id}
        value={value}
        disabled={disabled}
        className={cn("min-h-11 pr-9", className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-listbox` : undefined}
        aria-activedescendant={
          activeOption ? `${id}-option-${activeIndex}` : undefined
        }
        aria-invalid={
          props["aria-invalid"] || (wasValidated && Boolean(validationMessage))
        }
        aria-describedby={
          [
            props["aria-describedby"],
            wasValidated && validationMessage ? `${id}-selection-error` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
          setIsOpen(true);
          setWasValidated(false);
        }}
        onInvalid={() => setWasValidated(true)}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
          setWasValidated(true);
          if (selected && selected !== value) onChange(selected);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || blockedMessage) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) =>
              event.key === "ArrowDown"
                ? Math.min(expanded ? index + 1 : 0, visibleOptions.length - 1)
                : Math.max(expanded ? index - 1 : visibleOptions.length - 1, 0),
            );
          } else if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (activeOption) choose(activeOption);
            else if (selected) choose(selected);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"
      />
      {expanded ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-label={listLabel}
            className="max-h-60 overflow-y-auto overscroll-contain p-1"
          >
            {visibleOptions.map((option, index) => (
              <li
                key={option}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  activeIndex === index && "bg-accent text-accent-foreground",
                )}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option}
              </li>
            ))}
          </ul>
          {!matches.length ? (
            <p
              role="status"
              className="px-4 py-3 text-sm text-muted-foreground"
            >
              {emptyMessage}
            </p>
          ) : null}
          {matches.length > visibleOptions.length ? (
            <p
              role="status"
              className="border-t px-4 py-2 text-xs text-muted-foreground"
            >
              Escribe para filtrar los {matches.length} resultados.
            </p>
          ) : null}
        </div>
      ) : null}
      {wasValidated && validationMessage ? (
        <p
          id={`${id}-selection-error`}
          className="mt-2 text-sm text-destructive"
        >
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
