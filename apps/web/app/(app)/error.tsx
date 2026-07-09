"use client";

import { useEffect } from "react";
import { Button } from "@/app/_components/Button";
import { EmptyState } from "@/app/_components/EmptyState";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <EmptyState
        title="Something went wrong"
        description="This part of the app hit an unexpected error. You can try again, or come back later."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
