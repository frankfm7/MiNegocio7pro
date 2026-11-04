import { normalize } from './search';

// ==========================================
// NOMBRE COMÚN DE UN PRODUCTO
// ==========================================
// "TOTAL BLOCK ULTRAPROTECCIÓN SPF 50" → "Protector solar"
// Se sugiere solo a partir del nombre; el usuario lo puede cambiar.

const RULES: [RegExp, string | ((n: string) => string)][] = [
  [/\b(locion perfumada|body mist|splash|bruma)\b/, 'Loción perfumada'],
  [/\b(deso|desod|desodorante|antitranspirante|roll ?on|rollon)\b/, n => (/\b(roll ?on|rollon)\b/.test(n) ? 'Desodorante roll on' : /\bspray|aerosol\b/.test(n) ? 'Desodorante en spray' : 'Desodorante')],
  [/\b(block|spf|fps|protector|solar|bloqueador|ultraproteccion)\b/, 'Protector solar'],
  [/\b(desmaq|desmaquillador|desmaquillante|micelar)\b/, 'Desmaquillador'],
  [/\b(base)\b/, 'Base de maquillaje'],
  [/\b(labial|lapiz labial|gloss|brillo labial|lip)\b/, 'Labial'],
  [/\b(delineador|eyeliner)\b/, n => (/\bcejas?\b/.test(n) ? 'Delineador de cejas' : /\blabios?\b/.test(n) ? 'Delineador de labios' : 'Delineador de ojos')],
  [/\b(mascara|rimel|pestanas)\b/, 'Máscara de pestañas'],
  [/\b(sombra|sombras)\b/, 'Sombra de ojos'],
  [/\b(rubor|blush)\b/, 'Rubor'],
  [/\b(corrector|concealer)\b/, 'Corrector'],
  [/\b(polvo|polvos)\b/, 'Polvo facial'],
  [/\b(esmalte|unas)\b/, 'Esmalte de uñas'],
  [/\b(serum)\b/, 'Sérum facial'],
  [/\b(contorno de ojos)\b/, 'Contorno de ojos'],
  [/\b(crema|hidratante|humectante)\b/, n => (/\bmanos\b/.test(n) ? 'Crema de manos' : /\b(corporal|cuerpo|body)\b/.test(n) ? 'Crema corporal' : /\bpies\b/.test(n) ? 'Crema de pies' : 'Crema facial')],
  [/\b(shampoo|champu)\b/, 'Shampoo'],
  [/\b(acondicionador)\b/, 'Acondicionador'],
  [/\b(jabon)\b/, 'Jabón'],
  [/\b(gel de ducha|gel)\b/, 'Gel de ducha'],
  [/\b(talco)\b/, 'Talco'],
  [/\b(edp|edt|edc|parfum|parf|perfume|colonia|fragancia|fragancias|eau)\b/, n => (/\b(masculin\w*|hombre|homme|men|man)\b/.test(n) ? 'Perfume de hombre' : /\b(femenin\w*|mujer|femme|woman|women)\b/.test(n) ? 'Perfume de mujer' : 'Perfume')],
];

/** Nombre común sugerido para un producto (o '' si no se reconoce) */
export function guessCommonName(name: string, type = ''): string {
  const n = normalize(`${name} ${type}`);
  for (const [re, out] of RULES) if (re.test(n)) return typeof out === 'string' ? out : out(n);
  return '';
}
