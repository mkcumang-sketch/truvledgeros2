"use client";

import React, { useState } from "react";

interface TruvMonogramProps {
  className?: string;
  size?: number | string;
  useImageFirst?: boolean;
}

export function TruvMonogram({
  className = "w-9 h-9",
  size,
  useImageFirst = true,
}: TruvMonogramProps) {
  const [imgError, setImgError] = useState(false);

  // If user provided a raster asset in public/images/truv-icon.png or truv-logo.png and it hasn't errored
  if (useImageFirst && !imgError) {
    return (
      <div
        className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-xl overflow-hidden shadow-xs bg-slate-950 ${className}`}
        style={size ? { width: size, height: size } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/truv-icon.png"
          alt="TRUV Monogram"
          className="w-full h-full object-contain p-1"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Modern geometric T-V monogram with bronze/gold gradient (#D4AF37 / #B8860B / #996515)
  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-xl overflow-hidden shadow-xs bg-gradient-to-b from-slate-900 via-slate-950 to-black p-1.5 border border-slate-800/80 ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Primary Gold/Bronze Metallic Gradient */}
          <linearGradient id="truvGoldPrimary" x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stopColor="#F7D774" />
            <stop offset="30%" stopColor="#D4AF37" />
            <stop offset="65%" stopColor="#B8860B" />
            <stop offset="100%" stopColor="#996515" />
          </linearGradient>

          {/* Secondary Highlight Gradient for 3D Facets */}
          <linearGradient id="truvGoldHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF2A3" />
            <stop offset="50%" stopColor="#E5C158" />
            <stop offset="100%" stopColor="#A67C1E" />
          </linearGradient>

          {/* Deep Shadow Gradient for Beveled Depth */}
          <linearGradient id="truvGoldDeep" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C4972C" />
            <stop offset="50%" stopColor="#8C5C0D" />
            <stop offset="100%" stopColor="#5E3B04" />
          </linearGradient>

          {/* Subtle Glow Filter */}
          <filter id="truvGoldGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#D4AF37" floodOpacity="0.25" />
          </filter>
        </defs>

        <g filter="url(#truvGoldGlow)">
          {/* Top T Crossbar - Left Wing */}
          <path
            d="M 16 22 L 48 22 L 44 33 L 26 33 L 16 22 Z"
            fill="url(#truvGoldHighlight)"
          />

          {/* Top T Crossbar - Right Wing */}
          <path
            d="M 52 22 L 84 22 L 74 33 L 56 33 L 52 22 Z"
            fill="url(#truvGoldPrimary)"
          />

          {/* Central T Stem - Facet Left */}
          <path
            d="M 44 33 L 50 33 L 50 56 L 44 48 Z"
            fill="url(#truvGoldDeep)"
          />

          {/* Central T Stem - Facet Right */}
          <path
            d="M 50 33 L 56 33 L 56 48 L 50 56 Z"
            fill="url(#truvGoldHighlight)"
          />

          {/* Geometric Interlocking V - Left Wing descending to apex */}
          <path
            d="M 22 36 L 33 36 L 50 74 L 43 74 Z"
            fill="url(#truvGoldHighlight)"
          />

          {/* Geometric Interlocking V - Right Wing descending to apex */}
          <path
            d="M 78 36 L 67 36 L 50 74 L 57 74 Z"
            fill="url(#truvGoldDeep)"
          />

          {/* Lower Dynamic Chevrons / Apex Diamond Accent */}
          <path
            d="M 50 76 L 57 84 L 50 91 L 43 84 Z"
            fill="url(#truvGoldPrimary)"
          />

          {/* Inner Sharp Facet for high-resolution clarity */}
          <polygon
            points="50,42 54,50 50,58 46,50"
            fill="url(#truvGoldHighlight)"
            opacity="0.9"
          />
        </g>
      </svg>
    </div>
  );
}
