import { Suspense } from "react";
import { TransferView } from "./TransferView";

// TransferView reads ?from=... so it must sit behind a Suspense boundary.
export default function TransferPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 420, borderRadius: 18 }} />}>
      <TransferView />
    </Suspense>
  );
}
