import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, Play, X } from 'lucide-react';

export function Emblem({ className = '' }: { className?: string }) {
  return <svg className={className} width="32" height="38" viewBox="0 0 32 38" fill="none" aria-hidden="true">
    <path d="M16 0 30 21 16 16 2 21 16 0Z" fill="currentColor" />
    <path d="m2 24 14-5 14 5-14 14L2 24Z" fill="currentColor" opacity=".66" />
    <path d="m16 19 0 19 14-14-14-5Z" fill="currentColor" opacity=".4" />
  </svg>;
}

export function Brand({ onClick, small = false }: { onClick: () => void; small?: boolean }) {
  return <button className={`brand ${small ? 'brand-small' : ''}`} onClick={onClick} aria-label={small ? 'Pause Skybound' : 'Skybound home'}>
    <Emblem /><span>skybound<span className="brand-period">.</span></span>
  </button>;
}

export function PrimaryButton({ children, onClick, className = '', icon, disabled = false }: {
  children: ReactNode; onClick: () => void; className?: string; icon?: ReactNode; disabled?: boolean;
}) {
  return <button type="button" className={`primary-button ${className}`} onClick={onClick} disabled={disabled}>
    <span className="button-content">{icon || <Play size={17} fill="currentColor" />}<span>{children}</span></span>
    <ArrowRight size={19} className="button-arrow" />
  </button>;
}

export function Key({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <kbd className={wide ? 'key key-wide' : 'key'}>{children}</kbd>;
}

export function Modal({ children, onClose, titleId, className = '' }: {
  children: ReactNode; onClose: () => void; titleId: string; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') || []);
    getFocusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = getFocusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap);
    return () => { window.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
      {children}
    </div>
  </div>;
}