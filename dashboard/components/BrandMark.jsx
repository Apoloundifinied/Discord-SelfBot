'use client';

/**
 * BrandMark — o corvo Huginn (marca do console). Centraliza o uso da logo
 * com o tamanho por contexto (sidebar, lock screen, boot, reveal).
 */
export default function BrandMark({ className = '', size = 26, alt = '' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`brand-mark ${className}`.trim()}
      src="/brand/huginn.svg"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
