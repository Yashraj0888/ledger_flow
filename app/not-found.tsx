import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="boot" style={{ padding: 20 }}>
      <div className="card empty" style={{ maxWidth: 460 }}>
        <Logo />
        <div className="art" style={{ marginTop: 18 }}>
          <Compass size={32} />
        </div>
        <h3>Page not found</h3>
        <p>That page doesn&apos;t exist or has moved.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          Back home
        </Link>
      </div>
    </div>
  );
}
