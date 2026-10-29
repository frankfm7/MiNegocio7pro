export const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f3ebf9'/%3E%3Cg transform='translate(60,50)'%3E%3Crect x='10' y='30' width='60' height='50' rx='4' fill='%237c43ba' opacity='0.3'/%3E%3Cpath d='M0 30 L40 0 L80 30' fill='%237c43ba' opacity='0.5'/%3E%3Crect x='30' y='55' width='20' height='25' rx='2' fill='%237c43ba' opacity='0.6'/%3E%3Crect x='15' y='40' width='12' height='12' rx='1' fill='%237c43ba' opacity='0.4'/%3E%3Crect x='53' y='40' width='12' height='12' rx='1' fill='%237c43ba' opacity='0.4'/%3E%3C/g%3E%3Ctext x='100' y='140' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%237c43ba' opacity='0.6'%3ESin imagen%3E%3C/text%3E%3C/svg%3E";
export const fallbackCover = 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80';

export const DB_KEY = 'catalog_pro_data_v12';
export const CONTACT_KEY = 'catalog_pro_contact_v12';
export const QR_KEY = 'catalog_pro_qr_v12';
export const PENDING_KEY = 'pending_changes';
/** Se guarda por sesión: la bienvenida aparece cada vez que se abre la app */
export const WELCOME_KEY = 'welcome_seen_v31';

/** Unidades disponibles para el campo "Contenido / Presentación" */
export const CONTENT_UNITS = [
  { value: 'ml', label: 'ml (mililitros)' },
  { value: 'L', label: 'L (litros)' },
  { value: 'g', label: 'g (gramos)' },
  { value: 'kg', label: 'kg (kilogramos)' },
  { value: 'mg', label: 'mg (miligramos)' },
  { value: 'oz', label: 'oz (onzas)' },
  { value: 'cm', label: 'cm (centímetros)' },
  { value: 'm', label: 'm (metros)' },
  { value: 'mm', label: 'mm (milímetros)' },
  { value: 'pulg', label: 'pulg (pulgadas)' },
  { value: 'u', label: 'unidades' },
];

export const APP_NAME = 'MiNegocio7pro';
export const APP_SHORT_NAME = 'N7pro';
export const APP_VERSION = '3.3';
export const AVATAR_KEY = 'mc7_avatar';

/** Portada generada con el color del catálogo (funciona sin internet) */
export function coverFor(color = '#7c43ba', name = '') {
  const initial = (name.trim()[0] || '★').toUpperCase().replace(/[<&>"']/g, '');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 220'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}' stop-opacity='.95'/><stop offset='1' stop-color='${color}' stop-opacity='.55'/></linearGradient></defs><rect width='400' height='220' fill='url(#g)'/><circle cx='330' cy='40' r='90' fill='#fff' opacity='.12'/><circle cx='60' cy='200' r='70' fill='#fff' opacity='.1'/><text x='200' y='140' text-anchor='middle' font-family='Georgia,serif' font-size='96' font-weight='700' fill='#fff' opacity='.9'>${initial}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
