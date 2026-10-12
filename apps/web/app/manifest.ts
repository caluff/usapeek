import type { MetadataRoute } from "next";
import { BRAND_COLORS } from "@usapeek/ui/logo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "USAPEEK",
    short_name: "USAPEEK",
    description: "Explora productos y descubre tiendas en USAPEEK.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_COLORS.surface,
    theme_color: BRAND_COLORS.navy,
    icons: [
      { src: "/branding/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/branding/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/branding/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
