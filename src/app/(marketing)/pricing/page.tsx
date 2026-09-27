import type { Metadata } from "next";
import { PricingCards } from "@/components/pricing-cards";
import { publicEnv } from "@/env";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">Simple, flat-fee pricing</h1>
      <p className="text-muted mt-2">
        One payment covers everything below. No subscription and no hourly fees.
      </p>
      <div className="mt-8">
        <PricingCards />
      </div>
      <div className="card mt-10 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Good to know</h2>
        <ul className="text-muted list-disc space-y-2 pl-5">
          <li>
            Managed filing means depositing your original will with a court or registrar where your
            state or county offers lifetime deposit. Standard court deposit fees are included in the
            price. Where deposit isn&apos;t offered, we keep your original in our vault instead.
          </li>
          <li>Free updates for 12 months after purchase. Each update must be signed again.</li>
          <li>
            If our screening shows a simple will isn&apos;t right for you (for example you live in
            Louisiana) you won&apos;t be asked to pay.
          </li>
          <li>
            {publicEnv.appName} is not a law firm and does not provide legal advice. If your
            situation is complex we recommend a licensed estate-planning attorney.
          </li>
        </ul>
      </div>
    </div>
  );
}
