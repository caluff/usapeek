# Identidad USAPEEK

La geometría vectorial canónica está en `packages/ui/src/logo.tsx`. El logo se
redibujó a mano a partir de la referencia: símbolo UP/carrito, USA en contorno,
PEEK sólido y triángulo de la A violeta. No utiliza fuentes, imágenes incrustadas,
gradientes ni el PNG de referencia.

- Navy: `#0b2135` (`--brand-navy`).
- Violeta: `#7c3aed` (`--brand-accent`), incluido el triángulo, la cesta y las ruedas.
- Tinta para fondos oscuros: `#ffffff`.

Los tokens viven en `packages/ui/theme.css`; los tres frontends los comparten.
Para textos e iconos sobre superficies de la aplicación, usar
`text-brand-accent-text`: conserva el violeta en claro y lo aclara en oscuro
para mantener contraste. `bg-brand-accent` y los logos conservan `#7c3aed`.
Las superficies siempre oscuras del sidebar usan `text-sidebar-primary-text`.
Los SVG y los iconos exportados son transparentes, sin rectángulos ni superficies
de fondo. La variante clara conserva el navy original; la oscura cambia esa
tinta a blanco y mantiene el violeta. `--brand-logo-ink` elige la tinta según el
tema compartido; las superficies siempre oscuras usan la variante oscura fija.

## Componentes

Importar desde el adaptador `@/components/brand/logo` de cada aplicación o desde
`@usapeek/ui/logo` en otros componentes compartidos:

```tsx
<Logo width={220} />
<LogoMark size={32} />
<LogoWordmark width={140} />
<Logo tone="light" width={220} />
<Logo tone="dark" width={220} />
<Logo variant="mark" width={48} height={32} className="shrink-0" />
```

`Logo` admite `variant="full" | "mark" | "wordmark"`, `size` (ancho numérico),
`width`, `height`, `className` y props SVG. El alto numérico se deriva del ancho
cuando no se especifica. `tone="auto"` (predeterminado) sigue el tema; `light`
fija navy para fondos claros y `dark` fija blanco para fondos oscuros.
El nombre accesible predeterminado es USAPEEK; se puede
cambiar con `aria-label`. Dentro de enlaces con nombre propio, pasar
`aria-hidden="true"` al SVG. Los enlaces pertenecen a cada aplicación, por lo que
el componente compartido no depende del router de Next.js.

## Usos integrados

- Web: solo wordmark en el header, con tamaño adaptable a móvil; logo completo
  en footer y auth de escritorio; solo wordmark en auth móvil.
- Admin: solo wordmark en sidebar expandido; solo símbolo al colapsar;
  logo completo en login.
- Vendor: logo completo en auth y símbolo en sidebar, conservando el nombre de
  la tienda.

En composiciones compactas, usar el símbolo o el wordmark por separado, sin
mostrarlos juntos. El logo completo mantiene su composición vertical original
para los espacios dedicados a branding.

## Assets y metadata

Cada frontend publica `public/branding/logo-full.svg`, `logo-mark.svg` y
`logo-wordmark.svg` para fondos claros, con sus equivalentes `*-dark.svg` para
fondos oscuros, además de `public/favicon.svg`. Su directorio App Router
contiene `icon.svg`, `favicon.ico` y `apple-icon.png`. Next.js genera las etiquetas
de iconos automáticamente; no hay enlaces manuales duplicados en los layouts.
El ICO incluye PNG a 16, 32 y 48 px. El símbolo ocupa más espacio en favicon que
en los iconos de app para mejorar su lectura, sin incluir el wordmark. El fondo
transparente no pinta ninguna caja; el SVG adapta su tinta a la preferencia clara
u oscura del navegador.

La storefront incluye un `app/manifest.ts` con iconos de 192 y 512 px y uno
maskable de 512 px con margen para el círculo seguro. El icono Apple de 180 px
tiene fondo transparente. El sistema operativo puede aplicar su propio fondo
al icono instalado. El manifest prepara la identidad para instalación; no añade
un service worker ni disponibilidad sin conexión.

La vista previa para redes sociales está en `opengraph-image.png` en la raíz
App Router de cada frontend, acompañada de `opengraph-image.alt.txt`. Es una
tarjeta opaca de 1200 × 630 px, con el logo canónico blanco/violeta sobre navy.
Next.js publica las etiquetas Open Graph y Twitter con la imagen, sus
dimensiones y el texto alternativo. Los títulos y las descripciones conservan
los valores específicos de cada página; no se incluyen datos privados en la
imagen. La tarjeta es estática y no depende del backend para servirse.

Cada aplicación usa `NEXT_PUBLIC_SITE_URL` como origen público para las URLs
absolutas de sus metadatos. Debe ser una URL HTTPS sin ruta en despliegue; está
declarada por servicio en `.railway/railway.ts`. Si no está definida, se usa
`https://RAILWAY_PUBLIC_DOMAIN` y, en local, el puerto propio de cada aplicación.
Al cambiar de dominio, actualizar esta variable y generar un nuevo build.

## Regeneración y validación

```sh
pnpm branding:generate
```

El generador renderiza los componentes canónicos a SVG y utiliza el rasterizador
Sharp que ya distribuye Next.js para crear ICO/PNG. Los PNG son exportaciones del
vector y se reservan para formatos de plataforma que los necesitan. No editar a
mano las copias generadas: cambiar la geometría en `packages/ui/src/logo.tsx`,
regenerar y guardar todos los assets resultantes juntos.

Verificar accesibilidad, proporciones, paleta, consistencia entre aplicaciones,
entradas ICO y margen maskable al regenerar los assets. La integración visual
se verifica en escritorio/móvil y en ambos temas. Las pruebas unitarias de
branding se retiraron por solicitud del usuario.
