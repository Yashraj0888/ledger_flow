import { Suspense } from "react";
import { AccountView, AccountSkeleton } from "./AccountView";

// The account id is only known at request time, so the client view that reads
// it sits behind a Suspense boundary (required with Cache Components).
export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountView />
    </Suspense>
  );
}
