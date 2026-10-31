"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  spotlightColor?: string;
  enableSpotlight?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      className,
      spotlightColor = "rgba(99, 102, 241, 0.15)",
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

    return (
      <div
        ref={setRefs}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative overflow-hidden rounded-xl",
          "bg-glass-base/75 backdrop-blur-xl",
          "border border-white/[0.08]",
          "shadow-glass-card",
          "transition-all duration-200 ease-out",
          "hover:border-white/[0.16] hover:shadow-glass-sm",
          className
        )}
        {...props}
      >
        {/* Dynamic Interactive Spotlight Layer */}
        {enableSpotlight && (
          <div
            className="pointer-events-none absolute -inset-px rounded-xl transition-opacity duration-300 motion-reduce:hidden"
            style={{
              opacity: isHovered ? 1 : 0,
              background: `radial-gradient(450px circle at ${mousePosition.x}px ${mousePosition.y}px, ${spotlightColor}, transparent 80%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Specular top hairline reflection */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.18] to-transparent opacity-80"
          aria-hidden="true"
        />

        {/* Card Content */}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
