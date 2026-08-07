'use client';

import { useEffect, useRef, useState } from 'react';

const ID_RE = /^\d{17,21}$/;

/**
 * Busca global de identidade — agora vive na sidebar do console.
 * Toda a lógica (recentes, atalho "/", dropdown) permanece intacta;
 * apenas a moldura mudou (wordmark/status/licença foram para WindowBar).
 */
export default function Header({ onOpenIdentity }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  // Atalho "/" foca a busca; Esc fecha.
  useEffect(() => {
    function onKeyDown(e) {
      const target = e.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function fetchRecent() {
    try {
      const res = await fetch('/api/identity', { cache: 'no-store' });
      const body = await res.json();
      setRecent(body.recent ?? []);
    } catch {
      /* silencioso */
    }
  }

  function handleFocus() {
    fetchRecent();
    setOpen(true);
  }

  const q = query.trim().toLowerCase();
  const isNumericId = ID_RE.test(q);

  const matches = q
    ? recent.filter(
        p =>
          (p.global_name || '').toLowerCase().includes(q) ||
          (p.username || '').toLowerCase().includes(q) ||
          p.user_id.includes(q),
      )
    : recent;
  const suggestions = matches.slice(0, 6);

  function openUser(userId) {
    setOpen(false);
    setQuery('');
    onOpenIdentity?.(userId);
  }

  return (
    <div className="sidebar-search">
      <div className="header-search" ref={boxRef}>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Buscar usuário por ID ou nome…"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-dropdown"
          aria-autocomplete="list"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (isNumericId) openUser(q);
              else if (suggestions[0]) openUser(suggestions[0].user_id);
            }
          }}
        />
        <kbd className="search-kbd">/</kbd>
        {open && (
          <div className="search-dropdown" id="search-dropdown" role="listbox">
            {isNumericId && (
              <button type="button" className="search-item search-item-direct" role="option" aria-selected="false" onClick={() => openUser(q)}>
                <span className="search-item-main">
                  Abrir ID <code>{q}</code>
                </span>
                <span className="search-item-hint">coletar identidade</span>
              </button>
            )}
            {suggestions.map(p => (
              <button
                type="button"
                key={p.user_id}
                className="search-item"
                role="option"
                aria-selected="false"
                onClick={() => openUser(p.user_id)}
              >
                <span className="search-item-main">{p.global_name || p.username || p.user_id}</span>
                <span className="search-item-hint">{p.user_id}</span>
              </button>
            ))}
            {!isNumericId && suggestions.length === 0 && (
              <div className="search-empty">Nenhum perfil recente. Cole um ID numérico.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
