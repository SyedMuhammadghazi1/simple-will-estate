import Link from "next/link";
import { INCLUDED_FEATURES, PLANS, formatCents } from "@/lib/pricing";

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {Object.values(PLANS).map((plan) => (
        <div key={plan.id} className="card flex flex-col">
          <h3 className="text-xl font-semibold">{plan.name}</h3>
          <p className="text-muted mt-1 text-sm">{plan.description}</p>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold" data-testid={`price-${plan.id}`}>
              {formatCents(plan.amountCents)}
            </span>
            <span className="text-muted text-sm">one-time, no subscription</span>
          </p>
          <ul className="mt-5 flex-1 space-y-2 text-sm">
            {INCLUDED_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden="true" className="text-ok font-bold">
                  ✓
                </span>
                {f}
              </li>
            ))}
            {plan.willCount === 2 && (
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-ok font-bold">
                  ✓
                </span>
                Two matching wills, one for each partner
              </li>
            )}
          </ul>
          <Link
            href={`/sign-up?next=${encodeURIComponent(`/dashboard?plan=${plan.id}`)}`}
            className="btn btn-primary mt-6"
          >
            Choose {plan.id === "individual" ? "individual" : "couple"}
          </Link>
        </div>
      ))}
    </div>
  );
}
