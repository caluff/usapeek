import { updateUsersWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer, ProviderIdentityDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateMemberWorkflow } from "@mercurjs/core/workflows";
import type { CompleteGoogleAuthInput } from "../../api/auth/google/complete/contracts";

const profileName = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function fillGooglePanelProfile(container: MedusaContainer, actorType: CompleteGoogleAuthInput["actor_type"], actorId: string, provider: ProviderIdentityDTO) {
  if (actorType === "customer") return false;
  // A full-name-only profile supplies a display name; never guess its surname.
  const firstName = profileName(provider.user_metadata?.given_name) || profileName(provider.user_metadata?.name);
  const lastName = profileName(provider.user_metadata?.family_name);
  if (!firstName && !lastName) return false;
  try {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: actorType,
      fields: ["id", "first_name", "last_name"],
      filters: { id: actorId },
    }, { cache: { enable: false } });
    const actor = data[0];
    if (!actor) return false;
    const update = {
      ...(!profileName(actor.first_name) && firstName ? { first_name: firstName } : {}),
      ...(!profileName(actor.last_name) && lastName ? { last_name: lastName } : {}),
    };
    if (!Object.keys(update).length) return false;
    if (actorType === "user") {
      const { result } = await updateUsersWorkflow(container).run({ input: { updates: [{ id: actorId, ...update }] } });
      return result.length > 0;
    } else {
      const { result } = await updateMemberWorkflow(container).run({ input: {
        selector: { id: actorId, first_name: actor.first_name, last_name: actor.last_name },
        update,
      } });
      return result.length > 0;
    }
  } catch {
    // Profile enrichment must not prevent an otherwise valid Google login.
    container.resolve(ContainerRegistrationKeys.LOGGER).warn("Google panel profile enrichment could not be completed.");
    return false;
  }
}
