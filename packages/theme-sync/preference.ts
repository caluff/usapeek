export const THEME_COOKIE = "usapeek-theme";
export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemeCookie(cookies: string): ThemePreference | undefined {
  const value = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return isThemePreference(value) ? value : undefined;
}

export function themeCookieDomain(hostname: string, configured?: string) {
  const host = hostname.toLowerCase();
  const domain = configured?.trim().toLowerCase().replace(/^\./, "");
  if (domain) {
    // Only an explicitly configured ancestor is eligible; never guess a public suffix.
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) &&
      (host === domain || host.endsWith(`.${domain}`))
      ? domain
      : undefined;
  }
  return host === "orca.localhost" || host.endsWith(".orca.localhost")
    ? "orca.localhost"
    : undefined;
}

export function serializeThemeCookie(
  theme: ThemePreference,
  hostname: string,
  protocol: string,
  configuredDomain?: string,
) {
  const domain = themeCookieDomain(hostname, configuredDomain);
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${protocol === "https:" ? "; Secure" : ""}`;
}

export function createThemeSyncController({
  read,
  write,
  apply,
}: {
  read: () => ThemePreference | undefined;
  write: (theme: ThemePreference) => void;
  apply: (theme: ThemePreference) => void;
}) {
  let initialized = false;
  let observed: ThemePreference | undefined;
  let incoming: ThemePreference | undefined;

  return {
    observe(theme: unknown) {
      if (!isThemePreference(theme)) return;
      if (!initialized) {
        initialized = true;
        observed = theme;
        const shared = read();
        if (shared && shared !== theme) {
          incoming = shared;
          apply(shared);
        } else if (!shared) {
          write(theme);
        }
        return;
      }
      if (theme === incoming) {
        incoming = undefined;
        observed = theme;
        return;
      }
      if (theme === observed) return;
      observed = theme;
      incoming = undefined;
      write(theme);
    },
    synchronize() {
      const shared = read();
      if (!initialized || !shared || shared === (incoming ?? observed)) return;
      incoming = shared;
      apply(shared);
    },
  };
}
