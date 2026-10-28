import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { closeModal, useStore, type ModalId } from '../store';

interface Props {
  id: ModalId;
  children: ReactNode;
  /** Clases del fondo (z-index, color...) */
  className?: string;
  /** Cerrar al tocar fuera de la tarjeta */
  closeOnBackdrop?: boolean;
  onClose?: () => void;
}

const DEFAULT_BG = 'z-50 bg-[#1e1427]/60';

export default function Modal({ id, children, className = DEFAULT_BG, closeOnBackdrop = true, onClose }: Props) {
  const open = useStore(s => !!s.modals[id]);
  return (
    <div
      id={id}
      className={`modal fixed inset-0 p-4 grid place-items-center backdrop-blur-sm ${className} ${open ? 'open' : ''}`}
      onClick={e => {
        if (closeOnBackdrop && e.target === e.currentTarget) { closeModal(id); onClose?.(); }
      }}
    >
      {open && children}
    </div>
  );
}

export function CloseButton({ onClick, className = 'w-9 h-9' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`${className} rounded-full bg-[#f1ecf4] grid place-items-center hover:bg-[#e8dfec]`} aria-label="Cerrar">
      <X />
    </button>
  );
}
