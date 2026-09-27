import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { publicEnv } from "@/env";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const app = publicEnv.appName;
  return (
    <LegalPage title="Privacy Policy" updated="[DATE — set on approval]">
      <p>This policy explains what {app} collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email address and a hashed password.</li>
        <li>
          Will information you enter: names, dates of birth and relationships of you, your family
          and other people you name; your address; your wishes.
        </li>
        <li>
          Signed will scans you upload, payment status (card details are handled by our payment
          processor, Stripe, and never stored by us), and security logs.
        </li>
      </ul>
      <h2>How we protect it</h2>
      <p>
        Questionnaire answers, generated documents and uploads are encrypted at rest with
        AES-256-GCM. Staff access to your information is limited to what is needed to provide the
        service and every access is recorded in an audit log.
      </p>
      <h2>How we use it</h2>
      <p>
        To prepare your documents, file or store your will, send service emails (such as signing
        reminders), prevent fraud and meet legal obligations. We do not sell personal information.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Download a copy of your data at any time from your account page.</li>
        <li>
          Request deletion of your account. Some records (such as payment records and filed or
          vaulted legal documents) may need to be retained where required by law. [RETENTION
          SCHEDULE — to be defined with counsel.]
        </li>
      </ul>
      <h2>Service providers</h2>
      <p>[LIST OF SUB-PROCESSORS: hosting, database, email, payments — to be completed.]</p>
      <h2>State privacy rights</h2>
      <p>[CCPA/CPRA AND OTHER STATE-SPECIFIC DISCLOSURES — to be drafted by counsel.]</p>
      <h2>Contact</h2>
      <p>[PRIVACY CONTACT ADDRESS]</p>
    </LegalPage>
  );
}
