'use client';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <nav className="tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`tab${active === tab.id ? ' tab-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
