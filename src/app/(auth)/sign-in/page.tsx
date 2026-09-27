import type { Metadata } from "next";
import Link from "next/link";
import { FormMessage } from "@/components/forms/field";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card space-y-5">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {reset && (
          <FormMessage message="Your password was reset. Sign in with your new password." />
        )}
        <SignInForm next={next} />
        <p className="text-muted text-sm">
          New here?{" "}
          <Link
            href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"}
            className="link"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
