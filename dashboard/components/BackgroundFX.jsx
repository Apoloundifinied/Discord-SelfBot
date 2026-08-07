'use client';

import { useEffect, useRef } from 'react';

/**
 * BackgroundFX — camada de fundo animada (apenas visual, zero lógica).
 *
 * Composição em camadas:
 *   1. Blobs de luz "aurora" (gold + violeta) — CSS, animam só transform/opacity
 *      no compositor, ciclos de 50-65s, imperceptíveis como repetição.
 *   2. Poeira de luz (canvas 2D) — partículas minúsculas subindo com twinkle,
 *      profundidade e parallax suave de mouse (lerp). ~40-110 partículas.
 *   3. Varredura de luz ocasional (CSS) — um sweep sutil cruza a tela a cada ~26s.
 *   4. Grão de filme estático (body::after, no globals.css).
 *
 * Leve por design: sem blur em animação, sem sombras dinâmicas, DPR limitado a 2,
 * rAF pausa com aba oculta, frame único com prefers-reduced-motion.
 */
export default function BackgroundFX() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const GOLD = [242, 193, 78];
    const VIOLET = [167, 139, 250];
    const CREAM = [240, 237, 230];

    let width = 0;
    let height = 0;
    let particles = [];
    let raf = 0;
    let running = true;
    const mouse = { x: 0.5, y: 0.5 };
    const offset = { x: 0.5, y: 0.5 };

    function makeColor() {
      const r = Math.random();
      return r < 0.56 ? GOLD : r < 0.86 ? VIOLET : CREAM;
    }

    function makeParticle(initial) {
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : height + 8,
        r: 0.35 + Math.random() * 1.35,
        vy: 0.09 + Math.random() * 0.24,
        depth: 0.25 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.0011 + Math.random() * 0.0024,
        drift: 0.0005 + Math.random() * 0.001,
        alpha: 0.14 + Math.random() * 0.5,
        halo: Math.random() < 0.22,
        color: makeColor(),
      };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(40, (width * height) / 24000)));
      particles = Array.from({ length: count }, () => makeParticle(true));
    }

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      const px = (offset.x - 0.5) * 44;
      const py = (offset.y - 0.5) * 30;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.vy;
        p.x += Math.sin(t * p.drift + p.phase) * 0.25;
        if (p.y < -10) particles[i] = makeParticle(false);
        const tw = 0.55 + 0.45 * Math.sin(t * p.twinkle * 2 + p.phase);
        const a = p.alpha * tw;
        if (a <= 0.004) continue;
        const x = p.x + px * p.depth;
        const y = p.y + py * p.depth;
        const c = p.color;
        if (p.halo) {
          ctx.beginPath();
          ctx.arc(x, y, p.r * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.16).toFixed(3)})`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
        ctx.fill();
      }
    }

    function loop(now) {
      if (!running) return;
      offset.x += (mouse.x - offset.x) * 0.045;
      offset.y += (mouse.y - offset.y) * 0.045;
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function onMouse(e) {
      mouse.x = e.clientX / Math.max(1, window.innerWidth);
      mouse.y = e.clientY / Math.max(1, window.innerHeight);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    if (reduceMotion) {
      draw(0); // frame estático, sem loop
    } else {
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="bg-fx" aria-hidden="true">
      <div className="bg-blob bg-blob-gold" />
      <div className="bg-blob bg-blob-gold-2" />
      <div className="bg-blob bg-blob-violet" />
      <div className="bg-sweep" />
      <canvas ref={canvasRef} />
    </div>
  );
}
