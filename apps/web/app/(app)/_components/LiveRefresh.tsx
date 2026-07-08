"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/_components/ToastProvider";

export function LiveRefresh() {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 45_000);
    window.addEventListener("focus", refresh);

    const source = new EventSource("/api/realtime/stream");
    source.addEventListener("board-update", () => {
      toast.push({ variant: "success", message: "New team update received." });
      router.refresh();
    });
    source.addEventListener("notification", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { title?: string };
      toast.push({ variant: "error", message: payload.title ?? "New blocker alert." });
      router.refresh();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      source.close();
    };
  }, [router, toast]);

  return null;
}

