import { authorizeVendor } from "@/features/workspace/data";
import { AccountProfileDialog } from "./profile-dialog";
import {
  profileReturnPath,
  type ProfileSearchParams,
} from "./profile-completion";

export async function AccountProfile({
  searchParams,
}: {
  searchParams?: Promise<ProfileSearchParams>;
}) {
  const [{ membership }, params] = await Promise.all([
    authorizeVendor(),
    searchParams,
  ]);
  const user = membership.member;
  const returnTo =
    params?.profile === "complete" ? profileReturnPath(params.next) : undefined;
  return (
    <AccountProfileDialog
      firstName={user.first_name}
      lastName={user.last_name}
      returnTo={returnTo}
    />
  );
}
