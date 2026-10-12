import { defineConfig } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([...fixupConfigRules(nextTypescript)]);
