import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { automaticSettlementEnabled } from "./automatic-settlement";

export const AUTOMATIC_SETTLEMENT_ACTOR = "system:automatic-settlement";
// HTTP input cannot manufacture this capability; the scheduled workflow owns it.
export const AUTOMATIC_SETTLEMENT_AUTHORITY = Symbol("automatic-settlement");

export async function requireFinanceOperator(
  container: MedusaContainer,
  actorId: string,
) {
  if (!actorId || actorId !== actorId.trim())
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Se requiere un operador existente.",
    );
  const { data: users } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      { entity: "user", fields: ["id"], filters: { id: actorId } },
      { cache: { enable: false } },
    );
  if (users.length !== 1 || users[0].id !== actorId)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Se requiere un operador existente.",
    );
}

export async function requireSettlementAuthority(
  container: MedusaContainer,
  actorId: string,
  authority?: typeof AUTOMATIC_SETTLEMENT_AUTHORITY,
) {
  if (authority === AUTOMATIC_SETTLEMENT_AUTHORITY) {
    if (
      actorId !== AUTOMATIC_SETTLEMENT_ACTOR ||
      !(await automaticSettlementEnabled(container))
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La liquidación automática no está habilitada.",
      );
    return;
  }
  await requireFinanceOperator(container, actorId);
}
