import * as React from "react";
import type { ComponentProps } from "react";

export const BRAND_COLORS = {
  navy: "#0b2135",
  accent: "#7c3aed",
  surface: "#ffffff",
} as const;

const LOGO_DIMENSIONS = {
  full: { width: 1008, height: 520 },
  mark: { width: 464, height: 304 },
  wordmark: { width: 1008, height: 144 },
} as const;

export type LogoProps = Omit<ComponentProps<"svg">, "children"> & {
  variant?: keyof typeof LOGO_DIMENSIONS;
  tone?: "light" | "dark" | "auto";
  /** Width in pixels, unless width is supplied. Height follows the aspect ratio. */
  size?: number;
};

// Hand-drawn geometry from the supplied reference; no font or raster dependency.
function MarkPaths({ ink }: { ink: string }) {
  return (
    <>
      <g fill={ink}>
        <path d="M6 2 73 33v153c0 28 20 48 48 48s48-20 48-48v-72c0-7 4-12 12-12h12c5 0 9 3 11 9l22 61c2 5 2 9 2 14v47c0 4-1 7-4 11-23 35-60 56-103 56C54 300 0 247 0 186V8c0-5 2-7 6-6Z" />
        <path d="M173 0h184c60 0 107 49 107 110 0 72-53 130-119 130h-87c-4 0-6-2-6-6v-42c0-4 2-6 6-6h87c20 0 34-12 41-31l13-35c12-29-10-56-37-56H198c-5 0-8-2-10-6L168 9c-3-6-1-9 5-9Z" />
      </g>
      <g fill={BRAND_COLORS.accent}>
        <path d="M228 88h134c12 0 19 11 15 23l-16 41c-3 9-9 13-19 13h-88c-6 0-10-3-12-9l-21-57c-2-7 0-11 7-11Z" />
        <circle cx="277" cy="277" r="25" />
        <circle cx="360" cy="277" r="25" />
      </g>
    </>
  );
}

function WordmarkPaths({ ink }: { ink: string }) {
  return (
    <>
      <g fill="none" stroke={ink} strokeWidth="8">
        <path d="M8 6h31v70c0 21 12 33 34 33s34-12 34-33V6h31v71c0 36-25 56-65 56S8 113 8 77Z" />
        <path d="M274 6h-78c-23 0-39 16-39 37 0 22 16 37 39 37h35c11 0 15 5 15 12 0 8-4 12-15 12h-73v26h75c27 0 43-16 43-38 0-22-16-36-42-36h-37c-6 0-10-4-10-11 0-7 4-11 11-11h76Z" />
        <path d="m282 130 53-107c11-24 33-24 46 0l57 107h-30l-48-87-48 87Z" />
      </g>
      <path fill={BRAND_COLORS.accent} d="m330 134 30-54 30 54Z" />
      <g fill={ink}>
        <path
          fillRule="evenodd"
          d="M450 4h91c27 0 46 19 46 47s-19 48-46 48h-54v35h-37Zm37 32v31h49c9 0 15-6 15-16s-6-15-15-15Z"
        />
        <path d="M599 4h113c3 0 4 1 4 4l3 28h-84v19h73c2 0 2 1 2 3v25h-75v19h85v32H599Z" />
        <path d="M732 4h113c3 0 4 1 4 4l3 28h-84v19h73c2 0 2 1 2 3v25h-75v19h85v32H732Z" />
        <path d="M866 4h36v49h5l50-49h49l-65 63 65 67h-50l-49-50h-5v50h-36Z" />
      </g>
    </>
  );
}

/** Transparent logo: navy on light surfaces, white on dark, always brand purple. */
export function Logo({
  variant = "full",
  tone = "auto",
  size,
  width,
  height,
  "aria-label": label = "USAPEEK",
  "aria-hidden": ariaHidden,
  ...props
}: LogoProps) {
  const dimensions = LOGO_DIMENSIONS[variant];
  const ink =
    tone === "light"
      ? BRAND_COLORS.navy
      : tone === "dark"
        ? BRAND_COLORS.surface
        : `var(--brand-logo-ink, ${BRAND_COLORS.navy})`;
  const resolvedWidth = width ?? size ?? (height == null ? 200 : undefined);
  const resolvedHeight =
    height ??
    (typeof resolvedWidth === "number"
      ? (resolvedWidth * dimensions.height) / dimensions.width
      : undefined);
  const isDecorative = ariaHidden === true || ariaHidden === "true";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      width={resolvedWidth}
      height={resolvedHeight}
      role={isDecorative ? undefined : "img"}
      aria-label={isDecorative ? undefined : label}
      aria-hidden={ariaHidden}
      focusable="false"
      data-slot="brand-logo"
      data-variant={variant}
      data-tone={tone}
    >
      {isDecorative ? null : <title>{label}</title>}
      {variant === "full" ? (
        <>
          <g transform="translate(272 0)">
            <MarkPaths ink={ink} />
          </g>
          <g transform="translate(0 376)">
            <WordmarkPaths ink={ink} />
          </g>
        </>
      ) : variant === "mark" ? (
        <MarkPaths ink={ink} />
      ) : (
        <WordmarkPaths ink={ink} />
      )}
    </svg>
  );
}

export function LogoMark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="mark" />;
}

export function LogoWordmark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="wordmark" />;
}
