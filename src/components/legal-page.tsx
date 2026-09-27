import type { ReactNode } from "react";

/** Wrapper for template legal pages; the banner stays until counsel approves the text. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <div
        role="note"
        className="bg-warn-light text-warn mb-8 rounded-md border border-amber-300 p-4 text-sm"
        data-testid="lawyer-review-banner"
      >
        <strong>Template — requires lawyer review before launch.</strong> This text is a placeholder
        drafted without legal advice. It must be reviewed and adapted by a licensed attorney before
        real customers rely on it.
      </div>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted mt-1 text-sm">Last updated: {updated}</p>
      <div className="prose-legal mt-8">{children}</div>
    </article>
  );
}
