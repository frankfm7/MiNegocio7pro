import { getState } from '../store';
import { APP_NAME } from './constants';

/** Deja solo los dígitos y agrega el código de país si falta (se configura en "Datos del negocio") */
export function waNumber(phone: string | undefined | null, countryCode = getState().contactInfo?.countryCode): string {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  const cc = String(countryCode || '').replace(/\D/g, '');
  if (cc && d.length <= 9 && !d.startsWith(cc)) d = cc + d.replace(/^0+/, '');
  return d;
}

/** Enlace de WhatsApp. Sin número abre WhatsApp para elegir el contacto */
export function waLink(phone: string | undefined | null, text: string) {
  const n = waNumber(phone);
  return `https://${n ? 'wa.me/' + n : 'wa.me/'}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phone: string | undefined | null, text: string) {
  window.open(waLink(phone, text), '_blank', 'noopener');
}

/** Nombre del negocio para mensajes y recibos */
export const businessName = () => getState().activeStore?.store_name || getState().contactInfo?.business || APP_NAME;
