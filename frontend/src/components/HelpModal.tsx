import { useEffect } from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function HelpModal({ title, onClose, children }: HelpModalProps) {
  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-ep-cream rounded-t-2xl sm:rounded-2xl sm:max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ep-silver/20 flex-shrink-0">
          <h2 className="font-heading font-semibold text-ep-green text-base">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ep-silver hover:text-ep-green hover:bg-ep-sand transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 text-sm text-ep-green">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components used by both help pages ─────────────────────────────

export function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-heading font-semibold text-ep-green text-sm mb-2 pb-1 border-b border-ep-silver/20">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function HelpStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-ep-green/15 text-ep-green text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function HelpTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ep-orange/10 border border-ep-orange/30 rounded-lg px-3 py-2 text-xs text-ep-green/80 leading-relaxed">
      {children}
    </div>
  );
}
