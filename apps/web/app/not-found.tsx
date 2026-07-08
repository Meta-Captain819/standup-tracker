import Link from "next/link";
import { Button } from "@/app/_components/Button";
import { EmptyState } from "@/app/_components/EmptyState";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-calm-base px-6">
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Link href="/">
            <Button variant="primary">Back to home</Button>
          </Link>
        }
      />
    </div>
  );
}
