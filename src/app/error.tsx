"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted mt-3">
        Sorry — we couldn&apos;t complete that. Your saved answers are safe. Please try again.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Home
        </Link>
      </div>
    </div>
  );
}
