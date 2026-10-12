import medusa from "@medusajs/eslint-plugin";
import { fixupConfigRules } from "@eslint/compat";
import { defineConfig } from "eslint/config";

export default defineConfig(fixupConfigRules([...medusa.configs.recommended]));
