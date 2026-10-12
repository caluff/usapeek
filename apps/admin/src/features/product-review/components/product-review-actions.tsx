"use client";

import { useRef } from "react";
import { ProductActionsMenu } from "./product-actions-menu";
import { ProductModerationDialog } from "./moderation-dialog";

export function ProductReviewActions({
  productId,
  title,
  status,
  updatedAt,
  changeId,
}: {
  productId: string;
  title: string;
  status: string;
  updatedAt: string;
  changeId?: string;
}) {
  const actionsRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <ProductModerationDialog
        productId={productId}
        updatedAt={updatedAt}
        changeId={changeId}
        canReview={Boolean(changeId) || status === "proposed"}
        returnFocusRef={actionsRef}
      />
      <ProductActionsMenu
        productId={productId}
        title={title}
        status={status}
        updatedAt={updatedAt}
        hasPendingChange={Boolean(changeId)}
        triggerRef={actionsRef}
        showDetailLink={false}
      />
    </>
  );
}
