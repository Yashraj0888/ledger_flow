"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** While true, Esc / backdrop / close button are ignored. */
  busy?: boolean;
  children: React.ReactNode;
}

/** Accessible modal built on the native <dialog> (focus trap + Esc for free). */
export function Modal({ open, onClose, title, description, busy = false, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      {open && (
        <>
          <div className="modal-head">
            <div>
              <h2 id="modal-title">{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
        </>
      )}
    </dialog>
  );
}
