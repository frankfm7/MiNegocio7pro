import { useStore } from '../store';

/**
 * Foto de perfil redonda (o la inicial si no hay foto).
 * Sin props muestra al usuario que inició sesión; con `name`/`url` muestra a otra persona.
 */
export default function Avatar({ size = 40, className = '', name, url }: { size?: number; className?: string; name?: string; url?: string }) {
  const me = useStore(s => s.authUser);
  const label = name ?? me?.name;
  const src = name !== undefined ? url : me?.avatar;
  if (!label) return null;
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt={label} referrerPolicy="no-referrer" /> : (label.trim().charAt(0) || '?').toUpperCase()}
    </span>
  );
}
