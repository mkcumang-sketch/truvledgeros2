import React from "react";
import Link from "next/link";
import { Sparkles, ArrowLeft, Home, LogIn, Mail } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between font-sans antialiased">
      {/* Simple Header */}
      <header className="h-20 border-b border-slate-200 px-6 sm:px-8 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold group-hover:bg-slate-800 transition-colors shadow-2xs">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">TRUVCA LedgerOS</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-mono text-xs font-semibold">
            STATUS 404 // ROUTE NOT FOUND
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Page Not Located
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            The practice route or resource you are attempting to access does not exist or has been relocated
            within the TRUVCA LedgerOS directory.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return to Home</span>
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to Firm</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="h-16 border-t border-slate-200 px-6 sm:px-8 flex items-center justify-between text-xs text-slate-500">
        <div>&copy; {new Date().getFullYear()} TRUVTECH Practice Technologies.</div>
        <div className="flex items-center gap-1">
          <Mail className="w-3 h-3 text-slate-400" />
          <span>onboarding@truvtech.com</span>
        </div>
      </footer>
    </div>
  );
}
