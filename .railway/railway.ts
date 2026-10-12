import {
  defineRailway,
  github,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

const source = () =>
  github("caluff/usapeek", {
    branch: "develop",
  });

const REGION = "us-east4-eqdc4a";

export default defineRailway((ctx) => {
  const redisDatabase = redis("redis", { region: REGION });

  const api = service("api", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:api:deploy",
      watchPatterns: [
        "/packages/api/**",
        "/patches/**",
        "/.railway/**",
        "/blocks.json",
        "/.npmrc",
        "/.pnpmfile.mjs",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      preDeployCommand: ["pnpm db:migrate"],
      startCommand: "pnpm start:api",
      healthcheckPath: "/health",
      multiRegionConfig: {
        [REGION]: { numReplicas: 1 },
      },
    },
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ctx.shared.DATABASE_URL,
      REDIS_URL: redisDatabase.env.REDIS_URL,
      JWT_SECRET: ctx.shared.JWT_SECRET,
      COOKIE_SECRET: ctx.shared.COOKIE_SECRET,
      STORE_CORS: ctx.shared.STORE_CORS,
      ADMIN_CORS: ctx.shared.ADMIN_CORS,
      VENDOR_CORS: ctx.shared.VENDOR_CORS,
      AUTH_CORS: ctx.shared.AUTH_CORS,
      GOOGLE_CLIENT_ID: ctx.shared.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: ctx.shared.GOOGLE_CLIENT_SECRET,
      GOOGLE_CALLBACK_URL: ctx.shared.GOOGLE_CALLBACK_URL,
      STRIPE_API_KEY: ctx.shared.STRIPE_API_KEY,
      STRIPE_WEBHOOK_SECRET: ctx.shared.STRIPE_WEBHOOK_SECRET,
      STRIPE_PAYOUT_WEBHOOK_SECRET: ctx.shared.STRIPE_PAYOUT_WEBHOOK_SECRET,
      SUPABASE_S3_ENDPOINT: preserve(),
      SUPABASE_S3_REGION: preserve(),
      SUPABASE_S3_ACCESS_KEY_ID: preserve(),
      SUPABASE_S3_SECRET_ACCESS_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET: preserve(),
      ALGOLIA_APP_ID: preserve(),
      ALGOLIA_API_KEY: preserve(),
      ALGOLIA_PRODUCT_INDEX: preserve(),
      VENDOR_PUBLIC_URL: "https://usapeek-vendor.up.railway.app",
      VENDOR_ONBOARDING_TEST_VERIFICATION: preserve(),
    },
  });

  const worker = service("worker", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:worker:deploy",
      watchPatterns: [
        "/packages/api/**",
        "/patches/**",
        "/.railway/**",
        "/blocks.json",
        "/.npmrc",
        "/.pnpmfile.mjs",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:worker",
      multiRegionConfig: {
        [REGION]: { numReplicas: 1 },
      },
    },
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ctx.shared.DATABASE_URL,
      REDIS_URL: redisDatabase.env.REDIS_URL,
      JWT_SECRET: ctx.shared.JWT_SECRET,
      COOKIE_SECRET: ctx.shared.COOKIE_SECRET,
      STORE_CORS: ctx.shared.STORE_CORS,
      ADMIN_CORS: ctx.shared.ADMIN_CORS,
      VENDOR_CORS: ctx.shared.VENDOR_CORS,
      AUTH_CORS: ctx.shared.AUTH_CORS,
      GOOGLE_CLIENT_ID: ctx.shared.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: ctx.shared.GOOGLE_CLIENT_SECRET,
      GOOGLE_CALLBACK_URL: ctx.shared.GOOGLE_CALLBACK_URL,
      STRIPE_API_KEY: ctx.shared.STRIPE_API_KEY,
      STRIPE_WEBHOOK_SECRET: ctx.shared.STRIPE_WEBHOOK_SECRET,
      STRIPE_PAYOUT_WEBHOOK_SECRET: ctx.shared.STRIPE_PAYOUT_WEBHOOK_SECRET,
      SUPABASE_S3_ENDPOINT: preserve(),
      SUPABASE_S3_REGION: preserve(),
      SUPABASE_S3_ACCESS_KEY_ID: preserve(),
      SUPABASE_S3_SECRET_ACCESS_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET: preserve(),
      ALGOLIA_APP_ID: preserve(),
      ALGOLIA_API_KEY: preserve(),
      ALGOLIA_PRODUCT_INDEX: preserve(),
      VENDOR_PUBLIC_URL: "https://usapeek-vendor.up.railway.app",
    },
  });

  const web = service("UI Store", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:web",
      watchPatterns: [
        "/apps/web/**",
        "/packages/ui/**",
        "/packages/theme-sync/**",
        "/packages/order-reference/**",
        "/packages/vendor-onboarding-contracts/**",
        "/.railway/**",
        "/.npmrc",
        "/.pnpmfile.mjs",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:web",
      healthcheckPath: "/",
      multiRegionConfig: {
        [REGION]: { numReplicas: 1 },
      },
    },
    networking: {
      privateNetworkEndpoint: "usapeek-web",
      serviceDomains: {
        "usapeek-web.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://usapeek-api.up.railway.app",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
        ctx.shared.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        ctx.shared.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_VENDOR_URL: "https://usapeek-vendor.up.railway.app",
      NEXT_PUBLIC_SITE_URL: "https://usapeek-web.up.railway.app",
      SERVER_ACTIONS_ALLOWED_ORIGINS: "usapeek-web.up.railway.app",
      NEXT_PUBLIC_PRODUCT_IMAGE_URL: preserve(),
      NEXT_PUBLIC_GOOGLE_CALLBACK_URL:
        "https://usapeek-web.up.railway.app/auth/google/callback",
    },
  });

  const admin = service("UI Admin", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:admin",
      watchPatterns: [
        "/apps/admin/**",
        "/packages/ui/**",
        "/packages/theme-sync/**",
        "/packages/order-reference/**",
        "/packages/vendor-onboarding-contracts/**",
        "/.railway/**",
        "/.npmrc",
        "/.pnpmfile.mjs",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:admin",
      healthcheckPath: "/login",
      multiRegionConfig: {
        [REGION]: { numReplicas: 1 },
      },
    },
    networking: {
      privateNetworkEndpoint: "usapeek-admin",
      serviceDomains: {
        "usapeek-admin.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://usapeek-api.up.railway.app",
      NEXT_PUBLIC_GOOGLE_CALLBACK_URL:
        "https://usapeek-admin.up.railway.app/auth/google/callback",
      NEXT_PUBLIC_SITE_URL: "https://usapeek-admin.up.railway.app",
      SERVER_ACTIONS_ALLOWED_ORIGINS: "usapeek-admin.up.railway.app",
    },
  });

  const vendor = service("UI Vendor", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:vendor",
      watchPatterns: [
        "/apps/vendor/**",
        "/packages/ui/**",
        "/packages/theme-sync/**",
        "/packages/order-reference/**",
        "/packages/vendor-onboarding-contracts/**",
        "/.railway/**",
        "/.npmrc",
        "/.pnpmfile.mjs",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:vendor",
      healthcheckPath: "/seller/login",
      multiRegionConfig: {
        [REGION]: { numReplicas: 1 },
      },
    },
    networking: {
      privateNetworkEndpoint: "usapeek-vendor",
      serviceDomains: {
        "usapeek-vendor.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://usapeek-api.up.railway.app",
      NEXT_PUBLIC_STOREFRONT_URL: "https://usapeek-web.up.railway.app",
      NEXT_PUBLIC_SITE_URL: "https://usapeek-vendor.up.railway.app",
      NEXT_PUBLIC_GOOGLE_CALLBACK_URL:
        "https://usapeek-vendor.up.railway.app/auth/google/callback",
      SERVER_ACTIONS_ALLOWED_ORIGINS: "usapeek-vendor.up.railway.app",
    },
  });

  return project("usapeek", {
    resources: [redisDatabase, web, admin, vendor, api, worker],
  });
});
