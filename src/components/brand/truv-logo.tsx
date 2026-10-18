"use client";

import React from "react";
import Link from "next/link";
import { TruvMonogram } from "./truv-monogram";

export interface TruvLogoProps {
  size?: "sm" | "md" | "lg";
  theme?: "light" | "dark";
  showPill?: boolean;
  pillText?: string;
  subtext?: string;
  href?: string;
  className?: string;
}

export function TruvLogo({
  size = "md",
  theme = "light",
  showPill = true,
  pillText = "LEDGEROS",
  subtext,
  href,
  className = "",
}: TruvLogoProps) {
  const iconDimensions = {
    sm: "w-8 h-8",
    md: "w-9 h-9 sm:w-10 sm:h-10",
    lg: "w-11 h-11 sm:w-12 sm:h-12",
  }[size];

  const titleSizes = {
    sm: "text-base tracking-tight",
    md: "text-lg sm:text-xl tracking-tight",
    lg: "text-2xl sm:text-3xl tracking-tight",
  }[size];

  const pillSizes = {
    sm: "text-[9px] px-1.5 py-0.2",
    md: "text-[10px] px-2 py-0.5",
    lg: "text-xs px-2.5 py-0.5",
  }[size];

  const isDark = theme === "dark";

  const content = (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 group select-none ${className}`}>
      {/* Official Gold/Bronze Monogram */}
      <TruvMonogram className={iconDimensions} />

      {/* Typography & Pill Badge */}
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={`font-black font-sans leading-none ${
              isDark ? "text-white" : "text-slate-900"
            } ${titleSizes}`}
          >
            TRUV
          </span>

          {showPill && (
            <span
              className={`font-extrabold uppercase rounded-md tracking-wider leading-none border transition-colors ${
                isDark
                  ? "bg-orange-950/80 text-orange-300 border-orange-500/40 shadow-xs"
                  : "bg-orange-50 text-orange-700 border-orange-200/90 shadow-2xs"
              } ${pillSizes}`}
            >
              {pillText}
            </span>
          )}
        </div>

        {subtext && (
          <div
            className={`text-[10px] sm:text-[11px] font-medium tracking-wide mt-1 leading-tight ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {subtext}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="focus:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg"
      >
        {content}
      </Link>
    );
  }

  return content;
}
