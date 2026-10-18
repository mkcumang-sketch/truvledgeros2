"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Film } from "lucide-react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  nodeLabel?: string;
}

const CA_PRACTICE_NODES = [
  "GSTIN: 27MH (Active)",
  "GSTR-3B: Sign-off",
  "ARN: Verified",
  "Dual-Review Pass",
  "4-Stage Recovery",
  "Vault Encrypted",
];

export function CinematicHeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const [isPlayingMotion, setIsPlayingMotion] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIsReducedMotion(true);
      setIsPlayingMotion(false);
    }

    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsReducedMotion(true);
        setIsPlayingMotion(false);
      } else {
        setIsReducedMotion(false);
        setIsPlayingMotion(true);
      }
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Canvas particle and blue lattice simulation
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particleCount = width < 768 ? 20 : 40;
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        radius: Math.random() * 2 + 1.2,
        alpha: Math.random() * 0.4 + 0.2,
        phase: Math.random() * Math.PI * 2,
        nodeLabel: i < CA_PRACTICE_NODES.length ? CA_PRACTICE_NODES[i] : undefined,
      });
    }

    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.015;

      // Draw connective lattice between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = width < 768 ? 110 : 170;

          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.16;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(37, 99, 235, ${lineAlpha})`; // Professional blue #2563EB
            ctx.lineWidth = 0.8;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw and update particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const pulse = Math.sin(time * 1.5 + p.phase) * 0.3 + 0.7;
        const currentAlpha = p.alpha * pulse;

        // Glowing blue core
        ctx.beginPath();
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3.5);
        grad.addColorStop(0, `rgba(37, 99, 235, ${currentAlpha})`);
        grad.addColorStop(0.6, `rgba(59, 130, 246, ${currentAlpha * 0.4})`);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, p.radius * 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.8, currentAlpha + 0.2)})`;
        ctx.arc(p.x, p.y, p.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Node label on desktop
        if (p.nodeLabel && width >= 1024) {
          ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace";
          ctx.fillStyle = `rgba(30, 64, 175, ${currentAlpha * 0.85})`;
          ctx.fillText(p.nodeLabel, p.x + 8, p.y + 3);
        }
      });

      if (isPlayingMotion) {
        animationFrameId.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlayingMotion]);

  useEffect(() => {
    const cleanup = initCanvas();
    return () => {
      if (cleanup) cleanup();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [initCanvas]);

  const toggleMotion = () => {
    setIsPlayingMotion((prev) => {
      const next = !prev;
      if (videoRef.current) {
        if (next) {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      }
      return next;
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0 bg-[#FAFBFC]">
      {/* 1. Underlying Editorial CA Desk Photograph (Light Overlay) */}
      <div
        className={`absolute inset-0 bg-cover bg-center transition-transform duration-[20000ms] ease-out ${
          isPlayingMotion && !isReducedMotion ? "scale-106 translate-y-1" : "scale-100"
        }`}
        style={{
          backgroundImage: "url('/images/hero-poster.jpg')",
          filter: "brightness(0.92) contrast(1.05) saturate(0.85)",
          opacity: 0.22,
        }}
      />

      {/* 2. Optional Video Hook with Static Poster */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        loop
        poster="/images/hero-poster.jpg"
        onLoadedData={() => setVideoLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          videoLoaded ? "opacity-15" : "opacity-0"
        }`}
      >
        <source src="/videos/hero-cinematic.mp4" type="video/mp4" />
      </video>

      {/* 3. HTML5 Dynamic Motion Graphics Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* 4. Subtle Architecture Micro-Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(rgba(15, 23, 42, 0.4) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* 5. Soft Light Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.4) 0%, rgba(248, 250, 252, 0.85) 65%, #FFFFFF 100%),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 0%, rgba(248, 250, 252, 0.6) 60%, #FFFFFF 100%)
          `,
        }}
      />

      {/* 6. Accessible Motion Control Button */}
      <div className="absolute bottom-6 right-6 z-20 pointer-events-auto">
        <button
          onClick={toggleMotion}
          type="button"
          aria-label={isPlayingMotion ? "Pause background motion" : "Resume background motion"}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 hover:bg-white text-slate-700 border border-slate-300 text-xs font-mono shadow-sm backdrop-blur-xs transition-all hover:border-blue-400 cursor-pointer"
        >
          <Film className="w-3.5 h-3.5 text-blue-600" />
          <span>{isPlayingMotion ? "Motion: Active" : "Motion: Paused"}</span>
          {isPlayingMotion ? (
            <Pause className="w-3 h-3 text-slate-500" />
          ) : (
            <Play className="w-3 h-3 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}
