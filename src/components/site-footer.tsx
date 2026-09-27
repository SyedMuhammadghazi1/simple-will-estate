import Link from "next/link";
import { publicEnv } from "@/env";

export function SiteFooter() {
  return (
    <footer className="border-line mt-16 border-t bg-white">
      <div className="text-muted mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm">
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          <Link href="/legal/terms" className="hover:underline">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="hover:underline">
            Privacy Policy
          </Link>
          <Link href="/legal/disclaimer" className="hover:underline">
            Legal disclaimer
          </Link>
          <Link href="/pricing" className="hover:underline">
            Pricing
          </Link>
        </nav>
        <p data-testid="footer-disclaimer">
          <strong>{publicEnv.appName} is not a law firm</strong> and is not a substitute for an
          attorney or law firm. We provide self-help documents and administrative services, not
          legal advice. Communications with us are not protected by attorney-client privilege.
        </p>
        <p>
          © {new Date().getFullYear()} {publicEnv.appName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
