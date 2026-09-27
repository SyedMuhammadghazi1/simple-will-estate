import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { pendingDeletionRequest } from "@/server/services/account";
import { requireUser } from "@/server/session";
import { DeletionForm } from "./deletion-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requireUser("/dashboard/account");
  const pending = await pendingDeletionRequest(actor.userId);
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <h1 className="text-3xl font-bold">Account</h1>
      <section className="card space-y-1">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p>{actor.name}</p>
        <p className="text-muted">{actor.email}</p>
      </section>
      <section className="card space-y-3" aria-labelledby="export-title">
        <h2 id="export-title" className="text-lg font-semibold">
          Download your data
        </h2>
        <p className="text-muted text-sm">
          A JSON file with your profile, every will draft and version, and order history.
        </p>
        <a href="/api/account/export" className="btn btn-secondary" data-testid="export-data">
          Download my data (JSON)
        </a>
      </section>
      <section className="card space-y-3" aria-labelledby="delete-title">
        <h2 id="delete-title" className="text-lg font-semibold">
          Delete your account
        </h2>
        {pending ? (
          <Alert tone="info" title="Deletion requested">
            We received your request on{" "}
            {pending.createdAt.toLocaleDateString("en-US", { dateStyle: "long" })} and will confirm
            by email.
          </Alert>
        ) : (
          <>
            <p className="text-muted text-sm">
              We&apos;ll delete your account and personal data. Records we must keep by law (for
              example payment records, and signed wills held in our vault or filed with a court) are
              retained and we&apos;ll tell you what we keep. Download your data first if you want a
              copy.
            </p>
            <DeletionForm />
          </>
        )}
      </section>
    </div>
  );
}
