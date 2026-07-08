import { cn } from "@/app/_lib/cn";

export interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p role="alert" className={cn("flex items-center gap-1.5 text-xs text-blocker-accent", className)}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.75 3.5v4.5h-1.5v-4.5h1.5Zm-.75 7.25a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
      </svg>
      {message}
    </p>
  );
}
