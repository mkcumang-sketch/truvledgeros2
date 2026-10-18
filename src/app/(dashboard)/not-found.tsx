import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4 shadow-xs">
        <FileQuestion className="w-8 h-8" />
      </div>

      <h2 className="text-2xl font-bold text-graphite-900 tracking-tight mb-2">
        Resource Not Found
      </h2>

      <p className="text-sm text-graphite-600 max-w-md mx-auto mb-6">
        The record, client, or document you requested could not be located in your practice workspace.
      </p>

      <Link href="/dashboard">
        <Button variant="primary" size="md">
          <Home className="w-4 h-4 mr-2" />
          Back to Overview
        </Button>
      </Link>
    </div>
  );
}
