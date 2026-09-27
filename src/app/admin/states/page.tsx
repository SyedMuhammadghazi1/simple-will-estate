import type { Metadata } from "next";
import { listStateRules } from "@/lib/states";
import { requireRole, STAFF_ROLES } from "@/server/session";

export const metadata: Metadata = { title: "State rules" };

export default async function StatesPage() {
  await requireRole(STAFF_ROLES, "/admin/states");
  const rules = listStateRules();
  const unreviewed = rules.filter((r) => r.legalReviewStatus !== "reviewed").length;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">State rules — legal review status</h1>
      <p className="bg-danger-light text-danger rounded-md border border-red-200 p-4 text-sm">
        {unreviewed} of {rules.length} jurisdictions are <strong>unreviewed</strong>. These values
        are defaults compiled without legal review and must be verified by a licensed attorney in
        each state before launch (see docs/LAUNCH_CHECKLIST.md). Update{" "}
        <code>src/lib/states.ts</code> when a review is complete.
      </p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm" data-testid="state-rules-table">
          <thead className="bg-stone-50">
            <tr>
              <th scope="col" className="p-3">
                State
              </th>
              <th scope="col" className="p-3">
                Supported
              </th>
              <th scope="col" className="p-3">
                Witnesses
              </th>
              <th scope="col" className="p-3">
                Self-proving affidavit
              </th>
              <th scope="col" className="p-3">
                Notary
              </th>
              <th scope="col" className="p-3">
                Court deposit
              </th>
              <th scope="col" className="p-3">
                Review status
              </th>
              <th scope="col" className="p-3">
                Last reviewed
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.code} className="border-line border-t align-top">
                <th scope="row" className="p-3 text-left font-semibold">
                  {r.name} ({r.code})
                  {r.notes.length > 0 && (
                    <p className="text-muted mt-1 max-w-xs text-xs font-normal">
                      {r.notes.join(" ")}
                    </p>
                  )}
                </th>
                <td className="p-3">{r.supported ? "Yes" : "No"}</td>
                <td className="p-3">{r.witnessesRequired}</td>
                <td className="p-3">{r.selfProvingAffidavitAvailable ? "Yes" : "No"}</td>
                <td className="p-3">{r.affidavitRequiresNotary ? "Yes" : "No"}</td>
                <td className="p-3">
                  {r.courtDepositOffered ? (r.depositAuthority ?? "Yes") : "No"}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.legalReviewStatus === "reviewed" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
                  >
                    {r.legalReviewStatus}
                  </span>
                </td>
                <td className="p-3">{r.lastReviewedAt ?? "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
