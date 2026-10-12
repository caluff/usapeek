import { getCurrentAdmin } from "@/lib/auth-sdk";
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
  const [user, params] = await Promise.all([getCurrentAdmin(), searchParams]);
  if (!user) return null;
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
