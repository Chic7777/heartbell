"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="sheet" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="sheet-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭弹层" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
