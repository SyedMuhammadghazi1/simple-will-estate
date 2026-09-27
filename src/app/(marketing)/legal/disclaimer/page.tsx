import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { publicEnv } from "@/env";

export const metadata: Metadata = { title: "Legal disclaimer" };

export default function DisclaimerPage() {
  const app = publicEnv.appName;
  return (
    <LegalPage title="Legal disclaimer" updated="[DATE — set on approval]">
      <p>
        <strong>{app} is not a law firm and is not a substitute for an attorney.</strong> We provide
        software that helps you prepare your own will from your answers, general information about
        signing requirements, and administrative filing and storage services.
      </p>
      <p>
        We do not review your answers for legal sufficiency, advise you about your rights or
        options, or select forms for you beyond the automated rules described on our site. Our
        state-specific information is general in nature and may not reflect the most recent changes
        in the law.
      </p>
      <p>
        A simple will is not right for everyone. If you have a large or taxable estate, own a
        business, want to provide for someone who receives means-tested benefits, intend to leave
        out a spouse, have significant assets abroad, or expect a challenge to your will, please
        consult a licensed estate-planning attorney in your state.
      </p>
      <p>Communications between you and {app} are not protected by attorney-client privilege.</p>
    </LegalPage>
  );
}
