import type { SellerMemberDTO } from "@mercurjs/types";

export type VendorContextResult =
  | {
      status: "authenticated";
      membership: SellerMemberDTO;
      membershipCount: number;
    }
  | {
      status: "seller_unavailable";
      sellerStatus: string;
      sellerName: string;
      reason: string | null;
    }
  | {
      status:
        | "unauthenticated"
        | "forbidden"
        | "seller_missing"
        | "member_inactive"
        | "configuration_missing";
    };

export async function loadVendorMembershipContext(
  sellerId: string,
  listMemberships: () => Promise<SellerMemberDTO[]>,
  retrieveMembership: () => Promise<SellerMemberDTO>,
): Promise<VendorContextResult> {
  // The native list is authenticated and scoped to the actor, and includes the
  // same membership fields. Resource endpoints still enforce their own RBAC.
  const memberships = await listMemberships();
  const selected = memberships.find((entry) => entry.seller.id === sellerId);
  if (selected) {
    if (selected.seller_id !== sellerId) return { status: "forbidden" };
    if (!selected.member?.is_active) return { status: "member_inactive" };
    if (selected.seller.status !== "open")
      return {
        status: "seller_unavailable",
        sellerStatus: selected.seller.status,
        sellerName: selected.seller.name,
        reason: selected.seller.status_reason,
      };
    return { status: "authenticated", membership: selected, membershipCount: memberships.length };
  }
  const membership = await retrieveMembership();
  if (!membership.member?.is_active) return { status: "member_inactive" };
  // The native list omits terminated sellers; the fallback reports their
  // closure reason but never grants access to a membership absent from the list.
  if (membership.seller.id === sellerId && membership.seller_id === sellerId && membership.seller.status === "terminated")
    return {
      status: "seller_unavailable",
      sellerStatus: "terminated",
      sellerName: membership.seller.name,
      reason: membership.seller.status_reason,
    };
  return { status: "seller_missing" };
}
