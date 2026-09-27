import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { publicEnv } from "@/env";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const app = publicEnv.appName;
  return (
    <LegalPage title="Terms of Service" updated="[DATE — set on approval]">
      <p>
        These Terms govern your use of {app} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
        account you agree to them.
      </p>
      <h2>1. We are not a law firm</h2>
      <p>
        {app} provides self-help document preparation and administrative filing and storage
        services. We are not a law firm, we do not provide legal advice, and no attorney-client
        relationship is created by your use of the service. Our screening questions and
        recommendations are general information, not legal advice about your situation.
      </p>
      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old, of sound mind, and a resident of a supported US
        jurisdiction. We do not prepare wills for residents of Louisiana.
      </p>
      <h2>3. Your responsibilities</h2>
      <ul>
        <li>Provide accurate and complete information and review your documents before signing.</li>
        <li>
          Sign your will exactly as described in the signing instructions. An improperly signed will
          may be invalid.
        </li>
        <li>Keep your account credentials secure.</li>
      </ul>
      <h2>4. Fees, updates and refunds</h2>
      <p>
        Prices are flat, one-time fees shown at checkout. Your purchase includes 12 months of
        updates from the payment date. [REFUND POLICY — to be defined with counsel, e.g. full refund
        before documents are downloaded.]
      </p>
      <h2>5. Filing and storage</h2>
      <p>
        Where your state or county accepts lifetime deposit of wills, we will submit your signed
        original on your behalf. Otherwise we store it in our vault. Court procedures, fees and
        timelines are outside our control. [VAULT RETENTION, RETURN AND RELEASE-ON-DEATH PROCEDURE —
        to be defined.]
      </p>
      <h2>6. Limitation of liability</h2>
      <p>[LIMITATION OF LIABILITY AND DISCLAIMER OF WARRANTIES — to be drafted by counsel.]</p>
      <h2>7. Governing law and disputes</h2>
      <p>[GOVERNING LAW, VENUE AND DISPUTE RESOLUTION — to be drafted by counsel.]</p>
      <h2>8. Changes</h2>
      <p>We may update these Terms and will notify you of material changes by email.</p>
    </LegalPage>
  );
}
