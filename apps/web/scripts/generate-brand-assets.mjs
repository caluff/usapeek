import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND_COLORS, Logo } from "@usapeek/ui/logo";

// Reuse the SVG rasterizer already shipped with Next.js; no new dependency.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const root = new URL("../../../", import.meta.url);
const variants = ["full", "mark", "wordmark"];

const logos = Object.fromEntries(
  variants.map((variant) => [
    variant,
    renderToStaticMarkup(createElement(Logo, { variant, tone: "light" })) +
      "\n",
  ]),
);
const markContents = logos.mark.slice(
  logos.mark.indexOf(">") + 1,
  logos.mark.lastIndexOf("</svg>"),
);
const adaptiveMark = renderToStaticMarkup(
  createElement(Logo, { variant: "mark", tone: "auto" }),
);
const adaptiveMarkContents = adaptiveMark.slice(
  adaptiveMark.indexOf(">") + 1,
  adaptiveMark.lastIndexOf("</svg>"),
);
// SVG favicons adapt their ink to the browser theme without painting a backdrop.
// Fill the favicon canvas more generously; app icons retain safe inset padding.
function iconSvg(inset, adaptive = false) {
  const scale = (512 - inset * 2) / 464;
  const offsetY = (512 - 304 * scale) / 2;
  const style = adaptive
    ? "<style>@media(prefers-color-scheme:dark){:root{--brand-logo-ink:#ffffff}}</style>"
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${style}<g transform="translate(${inset} ${offsetY}) scale(${scale})">${adaptive ? adaptiveMarkContents : markContents}</g></svg>\n`;
}
const favicon = iconSvg(16, true);
const appIcon = iconSvg(64);

// ICO stores PNG entries at the browser's native sizes, avoiding resampling.
const faviconSizes = [16, 32, 48];
const pngs = await Promise.all(
  faviconSizes.map((size) =>
    sharp(Buffer.from(iconSvg(16)))
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
const icoHeader = Buffer.alloc(6 + pngs.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(pngs.length, 4);
let offset = icoHeader.length;
for (const [index, png] of pngs.entries()) {
  const entry = 6 + index * 16;
  icoHeader[entry] = faviconSizes[index];
  icoHeader[entry + 1] = faviconSizes[index];
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(png.length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
const ico = Buffer.concat([icoHeader, ...pngs]);
const apple = await sharp(Buffer.from(appIcon))
  .resize(180, 180)
  .png()
  .toBuffer();

// Social cards use an opaque canvas and the exact canonical vector lockup.
const socialLogo = renderToStaticMarkup(
  createElement(Logo, { tone: "dark", width: 720, "aria-hidden": true }),
).replace("<svg", '<svg x="240" y="129"');
const socialPreview = await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${BRAND_COLORS.navy}"/>${socialLogo}</svg>`,
))
  .png()
  .toBuffer();

async function save(path, content) {
  const url = new URL(path, root);
  await mkdir(new URL("./", url), { recursive: true });
  await writeFile(url, content);
}

for (const [app, appDir] of [
  ["web", "app"],
  ["admin", "src/app"],
  ["vendor", "src/app"],
]) {
  for (const variant of variants) {
    await save(
      `apps/${app}/public/branding/logo-${variant}.svg`,
      logos[variant],
    );
    await save(
      `apps/${app}/public/branding/logo-${variant}-dark.svg`,
      renderToStaticMarkup(createElement(Logo, { variant, tone: "dark" })) +
        "\n",
    );
  }
  await save(`apps/${app}/public/favicon.svg`, favicon);
  await save(`apps/${app}/${appDir}/icon.svg`, favicon);
  await save(`apps/${app}/${appDir}/favicon.ico`, ico);
  await save(`apps/${app}/${appDir}/apple-icon.png`, apple);
  await save(`apps/${app}/${appDir}/opengraph-image.png`, socialPreview);
  await save(
    `apps/${app}/${appDir}/opengraph-image.alt.txt`,
    "USAPEEK: logo blanco con detalles violetas sobre fondo azul marino.\n",
  );
}
for (const size of [192, 512]) {
  await save(
    `apps/web/public/branding/icon-${size}.png`,
    await sharp(Buffer.from(appIcon)).resize(size, size).png().toBuffer(),
  );
}
await save(
  "apps/web/public/branding/icon-maskable-512.png",
  await sharp(Buffer.from(iconSvg(96)))
    .png()
    .toBuffer(),
);
console.log(
  `USAPEEK assets generated in ${fileURLToPath(new URL("apps/", root))}`,
);
