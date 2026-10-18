import { Loader2 } from "lucide-react";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-ivory flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#F26B38]" />
        <p className="text-sm font-medium text-graphite-600 animate-pulse">
          Loading TRUV LedgerOS...
        </p>
      </div>
    </div>
  );
}
