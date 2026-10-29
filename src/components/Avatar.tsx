import { useStore } from '../store';

/** Foto de perfil del usuario (o su inicial si aún no tiene foto) */
export default function Avatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const user = useStore(s => s.authUser);
  if (!user) return null;
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {user.avatar ? <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer" /> : user.name.charAt(0).toUpperCase()}
    </span>
  );
}
