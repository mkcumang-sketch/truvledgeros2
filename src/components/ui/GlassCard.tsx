"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "light" | "dark" | "frosted";
  spotlightColor?: string;
  enableSpotlight?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      className,
      variant = "light",
      spotlightColor,
      enableSpotlight = true,
      onMouseMove,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    forwardedRef
  ) => {
    const localRef = useRef<HTMLDivElement | null>(null);
    const [mousePosition, setMousePosition] = useState({ x: -1000, y: -1000 });
    const [isHovered, setIsHovered] = useState(false);

    const defaultSpotlight =
      variant === "dark"
        ? "rgba(99, 102, 241, 0.15)"
        : "rgba(99, 102, 241, 0.05)";
    const resolvedSpotlight = spotlightColor || defaultSpotlight;

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!enableSpotlight || !localRef.current) {
          onMouseMove?.(e);
          return;
        }
        const rect = localRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        onMouseMove?.(e);
      },
      [enableSpotlight, onMouseMove]
    );

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        setIsHovered(true);
        onMouseEnter?.(e);
      },
      [onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        setIsHovered(false);
        setMousePosition({ x: -1000, y: -1000 });
        onMouseLeave?.(e);
      },
      [onMouseLeave]
    );

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    const variantStyles = {
      light:
        "bg-white/95 backdrop-blur-md border border-[#EBE9E1] text-[#1E293B] shadow-xs hover:border-[#CBD5E1] hover:shadow-sm",
      dark:
        "bg-[#0F172A]/90 backdrop-blur-md border border-[#1E293B] text-[#F8FAFC] shadow-glass-card hover:border-white/[0.16]",
      frosted:
        "bg-white/80 backdrop-blur-xl border border-[#EBE9E1] text-[#1E293B] shadow-xs hover:border-[#CBD5E1]",
    };

    return (
      <div
        ref={setRefs}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative overflow-hidden rounded-2xl transition-all duration-200 ease-out",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {/* Dynamic Interactive Spotlight Layer */}
        {enableSpotlight && (
          <div
            className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300 motion-reduce:hidden"
            style={{
              opacity: isHovered ? 1 : 0,
              background: `radial-gradient(450px circle at ${mousePosition.x}px ${mousePosition.y}px, ${resolvedSpotlight}, transparent 80%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Specular top hairline reflection */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
            variant === "dark"
              ? "bg-gradient-to-r from-transparent via-white/[0.18] to-transparent opacity-80"
              : "bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-60"
          )}
          aria-hidden="true"
        />

        {/* Card Content */}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
