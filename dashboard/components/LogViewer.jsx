'use client';

export default function LogViewer({ logs }) {
  if (!logs?.length) {
    return <pre className="log-viewer log-viewer-empty">Sem logs ainda.</pre>;
  }

  return (
    <pre className="log-viewer">
      {logs.map(entry => `${new Date(entry.ts).toLocaleTimeString()}  ${entry.line}`).join('\n')}
    </pre>
  );
}
