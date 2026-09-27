import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted mt-3">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Go home
      </Link>
    </div>
  );
}
