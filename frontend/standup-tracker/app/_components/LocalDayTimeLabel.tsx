import { cn } from "@/app/_lib/cn";

export type LocalDayTimeLabelMode = "day" | "time" | "full";

export interface LocalDayTimeLabelProps {
  /** The writer's UTC write instant, as an ISO string. */
  isoTimestamp: string;
  /** The writer's IANA timezone at the time of writing — never the viewer's browser zone. */
  timezone: string;
  mode?: LocalDayTimeLabelMode;
  className?: string;
}

const FORMAT_OPTIONS: Record<LocalDayTimeLabelMode, Intl.DateTimeFormatOptions> = {
  day: { weekday: "long", month: "short", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  full: { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

export function LocalDayTimeLabel({
  isoTimestamp,
  timezone,
  mode = "full",
  className,
}: LocalDayTimeLabelProps) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    ...FORMAT_OPTIONS[mode],
    timeZone: timezone,
  }).format(new Date(isoTimestamp));

  return (
    <time dateTime={isoTimestamp} className={cn("text-xs text-neutral-500", className)}>
      {formatted}
    </time>
  );
}
