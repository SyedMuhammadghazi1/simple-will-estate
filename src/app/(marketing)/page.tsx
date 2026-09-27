import Link from "next/link";
import { PricingCards } from "@/components/pricing-cards";
import { publicEnv } from "@/env";
import { PLANS, formatCents } from "@/lib/pricing";

const STEPS = [
  {
    title: "Answer plain-English questions",
    body: "About 15 minutes. We save as you go, check your answers, and flag situations where you should see an attorney instead.",
  },
  {
    title: "Pay once, download your will",
    body: `${formatCents(PLANS.individual.amountCents)} for one will or ${formatCents(PLANS.couple.amountCents)} for a couple. You get your will plus a signing kit written for your state.`,
  },
  {
    title: "Sign it — we handle the rest",
    body: "Sign with witnesses using our checklist, upload a scan, and we deposit the original with your court where offered, or keep it in our vault.",
  },
];

const FAQ = [
  {
    q: "Is a will made online legally valid?",
    a: "A will is valid when it meets your state's signing requirements — typically signing in front of two adult witnesses. Our signing kit walks you through exactly that. The document itself is only part of it: how you sign matters.",
  },
  {
    q: `Is ${publicEnv.appName} a law firm?`,
    a: "No. We are a document-preparation and filing service. We don't give legal advice, and we tell you when your situation needs an attorney (for example large taxable estates, special-needs beneficiaries or business succession).",
  },
  {
    q: "Which states do you support?",
    a: "All 50 states and Washington, D.C., except Louisiana, which uses a different (civil-law) system of wills. If you live in Louisiana we'll point you to a local attorney and you won't be charged.",
  },
  {
    q: "What does “managed filing” mean?",
    a: "Some courts and registrars accept a will for safekeeping during your lifetime. Where your state offers this, we prepare and send the deposit for you. Everywhere else, we store your original signed will in our secure vault.",
  },
  {
    q: "Can I change my will later?",
    a: "Yes. Updates are free for 12 months. Every update creates a new version that you sign again, so there's never confusion about which will is current.",
  },
  {
    q: "How is my information protected?",
    a: "Your answers and documents are encrypted at rest, access by our staff is logged, and you can export or ask us to delete your data at any time.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="bg-brand text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h1 className="text-4xl leading-tight font-bold md:text-5xl">
              A proper will, made simple. One flat fee.
            </h1>
            <p className="mt-5 text-lg text-blue-100">
              {publicEnv.appName} walks you through your will step by step, gives you state-specific
              signing instructions, and files it properly — no hourly bills, no subscription.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn text-brand bg-white hover:bg-blue-50">
                Start your will — {formatCents(PLANS.individual.amountCents)}
              </Link>
              <Link
                href="/pricing"
                className="btn border border-white/40 text-white hover:bg-white/10"
              >
                See pricing
              </Link>
            </div>
          </div>
          <div className="rounded-lg bg-white/10 p-6 text-blue-50">
            <p className="font-serif text-lg">Included in every will</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>✓ Print-ready will PDF</li>
              <li>✓ Signing kit for your state</li>
              <li>✓ 12 months of free updates</li>
              <li>✓ Secure encrypted vault storage</li>
              <li>✓ Managed court filing where available</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-bold">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <span className="bg-brand-light text-brand flex h-9 w-9 items-center justify-center rounded-full font-bold">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="text-muted mt-2 text-sm leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white py-16" aria-labelledby="pricing">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="pricing" className="text-3xl font-bold">
            Flat-fee pricing
          </h2>
          <p className="text-muted mt-2">
            Pay once. No subscriptions, no hourly rates, no surprises.
          </p>
          <div className="mt-8">
            <PricingCards />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16" aria-labelledby="faq">
        <h2 id="faq" className="text-3xl font-bold">
          Questions
        </h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="card group">
              <summary className="cursor-pointer font-semibold">{item.q}</summary>
              <p className="text-muted mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
