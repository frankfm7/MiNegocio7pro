import { LogIn } from 'lucide-react';
import { openAccount, openModal, useStore } from '../store';
import Avatar from './Avatar';

/** Esquina superior: foto del usuario si inició sesión; si no, botón visible "Entrar" */
export default function AccountButton() {
  const authUser = useStore(s => s.authUser);
  if (!authUser) {
    return (
      <button type="button" className="login-pill" onClick={() => openAccount()} aria-label="Iniciar sesión">
        <LogIn className="w-4 h-4" /> Entrar
      </button>
    );
  }
  return (
    <button type="button" className="flex-shrink-0 rounded-full" onClick={() => openModal('user-profile-modal')} aria-label="Mi perfil" title={authUser.name}>
      <Avatar size={44} />
    </button>
  );
}
