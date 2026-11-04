import { getState } from '../store';
import { APP_NAME } from './constants';

/** Deja solo los dígitos y agrega el código de país si falta (se configura en "Datos del negocio") */
/** Código de país según la moneda, si no se configuró en "Datos de la tienda" */
const CC_BY_CURRENCY: Record<string, string> = { Bs: '591', 'S/': '51', COP: '57', MXN: '52', ARS: '54', CLP: '56', Gs: '595' };

export function waNumber(phone: string | undefined | null, countryCode = getState().contactInfo?.countryCode): string {
  const raw = String(phone || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (raw.startsWith('+')) return d;
  const cc = String(countryCode || CC_BY_CURRENCY[getState().appCurrency] || '').replace(/\D/g, '');
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
