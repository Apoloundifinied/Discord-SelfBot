'use client';

import { useEffect, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';

const WORD = 'HUGGING';
// Tempo total até o fade-out (reduzido com prefers-reduced-motion).
const TOTAL_MS = 2350;
const LEAVE_MS = 430;

/**
 * BrandReveal — a tela de entrada do console: o corvo Huginn acende,
 * as letras do wordmark entram em cascata e a tela se dissolve no painel.
 * Puramente decorativa (aria-hidden) e dispensável: um clique pula na hora.
 */
export default function BrandReveal() {
  const [phase, setPhase] = useState('show'); // show | leave | gone
  const timersRef = useRef([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('leave'), reduced ? 450 : TOTAL_MS);
    const t2 = setTimeout(() => setPhase('gone'), reduced ? 800 : TOTAL_MS + LEAVE_MS);
    timersRef.current = [t1, t2];
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  if (phase === 'gone') return null;

  return (
    <div
      className={`brand-reveal${phase === 'leave' ? ' is-leaving' : ''}`}
      role="presentation"
      aria-hidden="true"
      onClick={() => {
        timersRef.current.forEach(clearTimeout);
        setPhase('leave');
        setTimeout(() => setPhase('gone'), LEAVE_MS);
      }}
    >
      <BrandMark className="brand-reveal-mark" size={96} />
      <div className="brand-reveal-word" aria-hidden="true">
        {WORD.split('').map((ch, i) => (
          <span key={i} style={{ animationDelay: `${0.5 + i * 0.07}s` }}>
            {ch}
          </span>
        ))}
      </div>
      <p className="brand-reveal-sub">console de inteligência · discord</p>
      <span className="brand-reveal-skip">clique para entrar</span>
    </div>
  );
}
