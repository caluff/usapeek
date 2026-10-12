# Shared theme preference

The three applications mount `ThemeSync` inside their existing `next-themes`
provider. This CSS-free package synchronizes only `light`, `dark`, or `system`;
it does not share authentication, profile data, or resolved operating-system
colors. The canonical CSS tokens, component primitives, and motion rules live in
`@usapeek/ui`; each application only keeps composition styles that are
specific to that product surface.

The non-sensitive `usapeek-theme` cookie takes precedence over stale
origin-local storage when an application mounts. Subsequent user changes are
published to that cookie. `next-themes` continues to manage classes, system
preference, hydration and same-origin tab synchronization. Cookie access happens
only after hydration; the initial next-themes script can briefly use the origin's
previous theme before adopting a preference changed in another application.

- On `localhost`, the host-only cookie works across ports 3000, 7000 and 7001.
- Orca preview hosts share a cookie scoped to `orca.localhost`.
- In production, configure the same public build variable
  `NEXT_PUBLIC_THEME_COOKIE_DOMAIN=example.com` in all three frontends when they
  live under an owned common parent such as `shop.example.com`,
  `admin.example.com`, and `vendor.example.com`. Do not use a public suffix or a
  parent shared with untrusted applications. The value must be an ancestor of
  the current hostname. HTTPS cookies include `Secure`.
- Without configuration, production uses a host-only cookie. Unrelated domains
  (including independent Railway domains), `localhost` versus Orca hosts, or
  different browser profiles cannot share this cookie. Browser isolation is
  intentional; configure a common owned parent for cross-app synchronization.

Cookie Store `change` events update already-open applications where supported.
Other browsers adopt the preference on focus, visibility restoration, or
`pageshow`. No timer, polling, HTTP request, Redis command or backend write is
introduced. Blocked cookies leave local theme selection usable but prevent
cross-origin persistence.

Run focused state and domain tests with:

```sh
pnpm --filter @usapeek/theme-sync test
```
