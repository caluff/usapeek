export type FormValue = {
  key: string;
  value: string | boolean | readonly string[];
};

export function formValuesSnapshot(values: readonly FormValue[], extra = "") {
  return JSON.stringify([values, extra]);
}

export function readFormValues(
  form: HTMLFormElement,
  useDefaults = false,
): FormValue[] {
  return Array.from(form.elements).flatMap((control, index) => {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) ||
      (control instanceof HTMLInputElement &&
        ["hidden", "submit", "button", "reset", "file"].includes(control.type))
    )
      return [];
    const isChoice =
      control instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(control.type);
    const key =
      control.id ||
      (isChoice && control.name
        ? `${control.name}:${control.value}`
        : control.name || String(index));
    const value =
      isChoice && control instanceof HTMLInputElement
        ? useDefaults
          ? control.defaultChecked
          : control.checked
        : control instanceof HTMLSelectElement && control.multiple
          ? Array.from(control.options)
              .filter((option) =>
                useDefaults ? option.defaultSelected : option.selected,
              )
              .map((option) => option.value)
          : useDefaults && !(control instanceof HTMLSelectElement)
            ? control.defaultValue
            : control.value;
    return [{ key, value }];
  });
}

export function hasUnsavedFormValues(saved: string, current: string) {
  return saved !== current;
}

export function createUnsavedFormTracker(initialExtra = "") {
  let savedExtra = initialExtra;
  const savedValues = new Map<string, FormValue["value"]>();
  return {
    hasChanges(
      values: readonly FormValue[],
      defaults: readonly FormValue[],
      extra = "",
    ) {
      for (const value of defaults) {
        if (!savedValues.has(value.key)) savedValues.set(value.key, value.value);
      }
      return hasUnsavedFormValues(
        formValuesSnapshot(
          values.map(({ key }) => ({ key, value: savedValues.get(key) ?? "" })),
          savedExtra,
        ),
        formValuesSnapshot(values, extra),
      );
    },
    markSaved(values: readonly FormValue[], extra = "") {
      savedValues.clear();
      for (const value of values) savedValues.set(value.key, value.value);
      savedExtra = extra;
    },
  };
}

export function shouldGuardLink({
  button,
  modified,
  target,
  download,
  currentUrl,
  href,
}: {
  button: number;
  modified: boolean;
  target: string | null;
  download: boolean;
  currentUrl: string;
  href: string;
}) {
  if (button !== 0 || modified || download || (target && target !== "_self"))
    return false;
  const current = new URL(currentUrl);
  const next = new URL(href, current);
  if (
    !["http:", "https:"].includes(next.protocol) ||
    next.origin !== current.origin
  )
    return false;
  return (
    next.pathname !== current.pathname ||
    next.search !== current.search
  );
}
