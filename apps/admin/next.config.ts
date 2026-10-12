import type { NextConfig } from "next";

function getServerActionAllowedOrigins() {
  const configured = process.env.SERVER_ACTIONS_ALLOWED_ORIGINS?.split(",") ?? [];
  const candidates = [
    ...(configured.length ? configured : [process.env.RAILWAY_PUBLIC_DOMAIN]),
    // Orca forwards this preview to localhost:7000 with a different host.
    process.env.NODE_ENV === "development"
      ? "marketplace-v2-3.orca.localhost:6136"
      : undefined,
  ];

  return candidates.flatMap((candidate) => {
    const value = candidate?.trim();
    if (!value) return [];

    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        return [];
      }
      return [url.host];
    } catch {
      return [];
    }
  }).filter((origin, index, origins) => origins.indexOf(origin) === index);
}

const nextConfig: NextConfig = {
  transpilePackages: ["@usapeek/ui", "@usapeek/order-reference"],
  reactStrictMode: true,
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];

    return [
      {
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      allowedOrigins: getServerActionAllowedOrigins(),
    },
  },
};

export default nextConfig;
