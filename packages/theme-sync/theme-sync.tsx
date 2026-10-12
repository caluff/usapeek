"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createThemeSyncController,
  readThemeCookie,
  serializeThemeCookie,
  THEME_COOKIE,
} from "./preference";

/** Shares only a visual preference. No authentication data or backend requests. */
export function ThemeSync({ cookieDomain }: { cookieDomain?: string }) {
  const { theme, setTheme } = useTheme();
  const applyTheme = useRef(setTheme);
  const controller = useRef<ReturnType<
    typeof createThemeSyncController
  > | null>(null);

  useEffect(() => {
    applyTheme.current = setTheme;
  }, [setTheme]);

  useEffect(() => {
    const sync = createThemeSyncController({
      read: () => {
        try {
          return readThemeCookie(document.cookie);
        } catch {
          return undefined;
        }
      },
      write: (preference) => {
        try {
          document.cookie = serializeThemeCookie(
            preference,
            window.location.hostname,
            window.location.protocol,
            cookieDomain,
          );
        } catch {
          // Browsers may block persistence; next-themes still updates this view.
        }
      },
      apply: (preference) => applyTheme.current(preference),
    });
    controller.current = sync;
    const synchronize = () => sync.synchronize();
    const onCookieChange = (event: Event) => {
      const change = event as Event & {
        changed?: { name: string }[];
        deleted?: { name: string }[];
      };
      if (
        [...(change.changed ?? []), ...(change.deleted ?? [])].some(
          (cookie) => cookie.name === THEME_COOKIE,
        )
      )
        synchronize();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") synchronize();
    };
    // Cookie Store is a progressive enhancement, unavailable on some browsers.
    const cookieStore = (window as Window & { cookieStore?: EventTarget })
      .cookieStore;
    cookieStore?.addEventListener("change", onCookieChange);
    window.addEventListener("focus", synchronize);
    window.addEventListener("pageshow", synchronize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cookieStore?.removeEventListener("change", onCookieChange);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("pageshow", synchronize);
      document.removeEventListener("visibilitychange", onVisible);
      controller.current = null;
    };
  }, [cookieDomain]);

  useEffect(() => {
    controller.current?.observe(theme);
  }, [cookieDomain, theme]);

  return null;
}
