import { batchVariantImagesWorkflow } from "@medusajs/medusa/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

type VariantImages = { variant_id: string; add: string[]; remove: string[] };

async function unlinkImages(
  container: MedusaContainer,
  updates: VariantImages[],
) {
  for (const update of [...updates].reverse())
    await batchVariantImagesWorkflow(container).run({
      input: { variant_id: update.variant_id, remove: update.add },
    });
}

export async function linkInitialVariantImages(
  container: MedusaContainer,
  updates: VariantImages[],
) {
  const linked: VariantImages[] = [];
  try {
    for (const update of updates) {
      await batchVariantImagesWorkflow(container).run({ input: update });
      linked.push(update);
    }
  } catch (error) {
    await unlinkImages(container, linked);
    throw error;
  }
  return linked;
}

export const linkInitialVariantImagesStep = createStep(
  "link-initial-variant-images",
  async (updates: VariantImages[], { container }) => {
    const linked = await linkInitialVariantImages(container, updates);
    return new StepResponse(linked, linked);
  },
  async (updates, { container }) => {
    if (updates?.length) await unlinkImages(container, updates);
  },
);
