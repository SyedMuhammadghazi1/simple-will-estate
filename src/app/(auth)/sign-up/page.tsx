import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted mt-1 text-sm">
            Your answers are saved as you go, so you can finish your will later.
          </p>
        </div>
        <SignUpForm next={next} />
        <p className="text-muted text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
