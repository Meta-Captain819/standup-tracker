import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/app/_components/Card";
import { getSession } from "@/app/_lib/session/read";

export default async function MarketingHomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">Standup Tracker</p>
        <h1 className="mt-3 text-3xl font-semibold text-neutral-900 sm:text-4xl">
          Daily standups that stay aligned to each teammate&apos;s own local day.
        </h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/signin" className="block">
            <Card interactive className="h-full text-left">
              <h2 className="text-lg font-semibold text-neutral-900">Sign in</h2>
              <p className="mt-2 text-sm text-neutral-500">Return to your team&apos;s current standup space.</p>
            </Card>
          </Link>
          <Link href="/start-a-team" className="block">
            <Card interactive className="h-full text-left">
              <h2 className="text-lg font-semibold text-neutral-900">Start a new team</h2>
              <p className="mt-2 text-sm text-neutral-500">Create the first admin account and invite your team.</p>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
