import { cn } from "@/app/_lib/cn";

export type ToastVariant = "success" | "error" | "info";

export interface ToastProps {
  variant: ToastVariant;
  message: string;
  onDismiss?: () => void;
}

const variantClasses: Record<ToastVariant, string> = {
  success: "border-brand-200 bg-brand-50 text-brand-700",
  error: "border-blocker-300 bg-blocker-accent-bg text-blocker-700",
  info: "border-neutral-200 bg-surface text-neutral-700",
};

export function Toast({ variant, message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-card",
        variantClasses[variant],
      )}
    >
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-current opacity-60 hover:opacity-100"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
            <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06L6.94 8l-4.72 4.72a.75.75 0 1 0 1.06 1.06L8 9.06l4.72 4.72a.75.75 0 0 0 1.06-1.06L9.06 8l4.72-4.72a.75.75 0 0 0-1.06-1.06L8 6.94 3.28 2.22Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
