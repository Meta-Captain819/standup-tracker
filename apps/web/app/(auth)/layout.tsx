export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-calm-base px-4 py-12">
      <span className="text-lg font-semibold text-neutral-800">Standup Tracker</span>
      {children}
    </div>
  );
}
