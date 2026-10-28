"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  tone: number;
  drift: number;
};

const TONES = [
  "169,116,255",
  "232,121,249",
  "125,223,176",
  "255,196,107",
] as const;

function seeded(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Fixed premium background for the landing experience:
 * 1) tonal violet base, 2) slow aurora light, 3) perspective signal field.
 * The canvas is decorative, pauses when hidden, and renders one static frame
 * for reduced-motion users.
 */
export default function PremiumBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;
    let particles: Particle[] = [];

    const root = document.querySelector<HTMLElement>(".lp");

    const buildParticles = () => {
      const count = Math.round(Math.min(104, Math.max(42, width / 15)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: seeded(index + 1) * 2 - 1,
        y: seeded(index + 21) * 1.24 - 0.62,
        z: seeded(index + 41),
        size: 0.7 + seeded(index + 61) * 1.7,
        tone: index % TONES.length,
        drift: seeded(index + 81) * Math.PI * 2,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(1.5, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      buildParticles();
      if (reduce) draw(1200);
    };

    const draw = (time: number) => {
      const t = time * 0.001;
      const progress = Number.parseFloat(root?.style.getPropertyValue("--scroll-progress") || "0") || 0;
      const velocity = Number.parseFloat(root?.style.getPropertyValue("--scroll-velocity") || "0") || 0;
      smoothX += (pointerX - smoothX) * 0.035;
      smoothY += (pointerY - smoothY) * 0.035;

      context.clearRect(0, 0, width, height);

      const centerX = width * (0.5 + smoothX * 0.018);
      const centerY = height * (0.46 + smoothY * 0.014 - progress * 0.025);
      const focal = Math.min(width, height) * 0.92;
      const rotY = t * 0.045 + progress * 0.72 + smoothX * 0.08;
      const rotX = Math.sin(t * 0.11) * 0.035 + smoothY * 0.045;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const project = (x: number, y: number, z: number) => {
        const rx = x * cosY - z * sinY;
        const rz = x * sinY + z * cosY;
        const ry = y * cosX - rz * sinX;
        const depth = 2.35 + (y * sinX + rz * cosX) * 0.24 + z * 0.16;
        const scale = focal / Math.max(1.15, depth + 2.1);
        return {
          x: centerX + rx * scale,
          y: centerY + ry * scale,
          scale: scale / 310,
          depth,
        };
      };

      // Perspective signal plane: a quiet 3D floor that gives depth without competing with content.
      context.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const z = -0.9 + i * 0.18;
        const a = project(-1.25, 0.74, z);
        const b = project(1.25, 0.74, z);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = `rgba(190,165,255,${0.025 + (i % 3 === 0 ? 0.018 : 0)})`;
        context.stroke();
      }
      for (let i = 0; i <= 12; i++) {
        const x = -1.2 + i * 0.2;
        const a = project(x, 0.74, -0.9);
        const b = project(x, 0.74, 0.9);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = "rgba(190,165,255,0.028)";
        context.stroke();
      }

      const projected = particles.map((particle, index) => {
        const wave = Math.sin(t * (0.32 + Math.abs(velocity) * 0.35) + particle.drift) * 0.028;
        return {
          ...project(
            particle.x + Math.sin(t * 0.16 + particle.drift) * 0.018,
            particle.y + wave,
            particle.z,
          ),
          particle,
          index,
        };
      });

      const linkDistance = width < 640 ? 76 : 118;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance > linkDistance) continue;
          const alpha = (1 - distance / linkDistance) * 0.11;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.strokeStyle = `rgba(190,165,255,${alpha.toFixed(3)})`;
          context.stroke();
        }
      }

      for (const point of projected) {
        const tone = TONES[point.particle.tone];
        const radius = Math.max(0.75, point.particle.size * point.scale);
        const alpha = Math.min(0.62, Math.max(0.14, point.scale * 0.54));
        const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 5.2);
        glow.addColorStop(0, `rgba(${tone},${(alpha * 0.32).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${tone},0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, radius * 5.2, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${tone},${alpha.toFixed(3)})`;
        context.fill();
      }
    };

    const loop = (time: number) => {
      if (running && !document.hidden) draw(time);
      raf = window.requestAnimationFrame(loop);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointerY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    const onVisibility = () => {
      running = !document.hidden;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) draw(1200);
    else raf = window.requestAnimationFrame(loop);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  return (
    <div className="premium-background" aria-hidden="true" data-premium-background>
      <div className="premium-bg__base" />
      <canvas ref={canvasRef} className="premium-bg__canvas" />
      <div className="premium-bg__aurora premium-bg__aurora--orchid" />
      <div className="premium-bg__aurora premium-bg__aurora--violet" />
      <div className="premium-bg__aurora premium-bg__aurora--mint" />
      <div className="premium-bg__grid" />
      <div className="premium-bg__vignette" />
    </div>
  );
}
