import Link from "next/link";
import { publicEnv } from "@/env";
import { getActor, isStaff } from "@/server/session";
import { signOutAction } from "@/app/(auth)/actions";

export async function SiteHeader() {
  const actor = await getActor().catch(() => null);
  return (
    <header className="border-line border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-brand font-serif text-xl font-bold">
          {publicEnv.appName}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/pricing" className="hover:underline">
            Pricing
          </Link>
          {actor ? (
            <>
              <Link href="/dashboard" className="hover:underline">
                My wills
              </Link>
              {isStaff(actor) && (
                <Link href="/admin" className="hover:underline">
                  Staff console
                </Link>
              )}
              <Link href="/dashboard/account" className="hover:underline">
                Account
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="hover:underline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hover:underline">
                Sign in
              </Link>
              <Link href="/sign-up" className="btn btn-primary min-h-9 px-3 py-1.5">
                Start your will
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
