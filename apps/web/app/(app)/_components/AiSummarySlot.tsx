"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/app/_components/Badge";
import { Card } from "@/app/_components/Card";
import { Skeleton } from "@/app/_components/Skeleton";
import type { DaySummary } from "@/app/_lib/validation/responses";

export function AiSummarySlot({ standupDate }: { standupDate: string }) {
  const [summary, setSummary] = useState<DaySummary | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/insights/summary?standupDate=${standupDate}`)
      .then((response) => (response.ok ? response.json() : { status: "unavailable" }))
      .then((data: DaySummary) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setSummary({ status: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [standupDate]);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">AI summary</h2>
        <Badge variant="neutral">{standupDate}</Badge>
      </div>
      {!summary ? (
        <div className="space-y-2">
          <Skeleton height="0.875rem" />
          <Skeleton height="0.875rem" width="80%" />
        </div>
      ) : summary.status === "ready" ? (
        <p className="whitespace-pre-wrap text-sm text-neutral-700">{summary.summary}</p>
      ) : (
        <p className="text-sm text-neutral-500">Summary unavailable right now.</p>
      )}
    </Card>
  );
}

