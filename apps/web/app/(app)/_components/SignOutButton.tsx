"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/Button";
import { requestJson } from "@/app/_lib/api/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      router.replace("/signin");
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={signOut} isLoading={pending}>
      Sign out
    </Button>
  );
}
