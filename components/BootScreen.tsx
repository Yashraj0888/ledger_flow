import { ArrowLeftRight } from "lucide-react";

/** Full-screen splash shown while the session is being restored. */
export function BootScreen() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <span className="logo-mark">
        <ArrowLeftRight size={26} strokeWidth={2.6} />
      </span>
    </div>
  );
}
