// ==========================================
// CORRECCIÓN DE NOMBRES LEÍDOS POR OCR (perfumería y cosmética)
// ==========================================
// El lector confunde letras parecidas (O/0, S/5, I/1, B/8...) y a veces agrega
// basura al inicio o al final. Con un diccionario de palabras frecuentes en
// facturas de Ésika, L'Bel, Cyzone, Yanbal y similares se corrigen las palabras
// "casi iguales" y se quitan los restos que no son palabras.

const WORDS = `
ROLL ON ROLLON DESO DESOD DESODORANTE ANTITRANSPIRANTE PERFUMADO PERFUMADA PERFUME PERFUMES PARFUM PARF EAU DE TOILETTE COLONIA
LOCION LOCIÓN FRAGANCIA FRAGANCIAS MASCULINA MASCULINAS MASCULINO FEMENINA FEMENINAS FEMENINO HOMBRE MUJER EDP EDT EDC
SPRAY BODY MIST SPLASH CREMA CREMAS CORPORAL FACIAL MANOS PIES HIDRATANTE HUMECTANTE NUTRITIVA ANTIEDAD ANTIARRUGAS
BASE LIQUIDA LÍQUIDA POLVO POLVOS COMPACTO SUELTO CORRECTOR LABIAL LABIALES MATTE MATE BRILLO GLOSS DELINEADOR LAPIZ LÁPIZ
OJOS LABIOS CEJAS MASCARA MÁSCARA PESTAÑAS SOMBRA SOMBRAS RUBOR ILUMINADOR ESMALTE UÑAS DESMAQUILLADOR DESMAQ BIFASICO
BIFÁSICO BIF LIMPIADOR LIMPIADORA TONICO TÓNICO SERUM SÉRUM CONTORNO PROTECTOR PROTECTORA SOLAR ULTRAPROTECCION
ULTRAPROTECCIÓN BLOCK TOTAL SPF FPS SHAMPOO CHAMPU ACONDICIONADOR TRATAMIENTO CAPILAR CABELLO JABON JABÓN GEL DUCHA TALCO
LARGA DURACION DURACIÓN ULTRA NEGRO NEGRA ROSE ROSÉ ROJO ROJA ROSA NUDE CORAL INTENSE INTENSO INTENSA NIGHT AIR SPORT BLACK
SWEET DRY EFFECT EXPRESS SALVAJE EXPRESSION SPIRIT ABSOLUTE SCENT VANILLA RASPBERRY BURGUNDY MAGNIFIQUE INF ESS UPG PROB
MUESTRA DEMO DEMOSTRADOR TESTER CATALOGO CATÁLOGO REVISTA FLYER KIT INICIO GANADOR GANADORA CARTILLA CAMPAÑA BOLETIN BOLETÍN
ENTRENOS CORPORATIVO PARA CON SIN EN Y PIEL SECA GRASA MIXTA NORMAL SENSIBLE TATTOO PLUMON PLUMÓN PRIVE PRIVÉ PREMIO
GRATIS OBSEQUIO REGALO SET ESTUCHE ESTUCHES DUO TRIO MINI CLASSIC CLASICO CLÁSICO NEW NUEVO NUEVA EDICION EDICIÓN LIMITADA
ESIKA ÉSIKA BELCORP YANBAL CYZONE LBEL UNIQUE NATURA AVON
KALOS KALOSSPORT MAGNAT LEYENDA PULSO TRAX DORSAY VIBRANZA CARDIGAN TOTALSEC BEAUTIFUL FEMME EXITO ÉXITO SOIREE SOIRÉE
AROMA SED LOVE SUPERNOVA ASTRA BLUE HIDDEN AGUA FRESCA CAPTURE ACCORDES DIAMOND GOLD SILVER WHITE FLOWER FLOWERS LIRIO
BLEU LIASSON MITHYKA SATIN HOMME ENERGIE DREAM BRISA PARIS CONNEXION NOUVEAU FOCUS DIVINE ELIXIR MAGNIFIQUE INFINITY
NITRO MUSK MORA DANCING AURORA GRAVITY CITRUS FRUIT CANDY COCO VAINILLA FRESH COOL
AZUL VERDE MARRON MARRÓN CAFE CAFÉ GRIS VIOLETA LILA DORADO PLATEADO BEIGE CANELA MIEL ARENA CLARO OSCURO MEDIO
CCORI OSADIA OSADÍA ZENTRO TEMPTATION OHM NOW GAIA SOLO ELLA ARANTO RUBI RUBÍ ORO PLATA PURE PURA FIORI CIELO HECHIZO
`.trim().split(/\s+/);

const VOCAB = new Set(WORDS);
const SHORT_OK = new Set(['ON', 'DE', 'EN', 'Y', 'CC', 'ML', 'G', 'GR', 'L', 'LT', 'KG', 'OZ', 'MG', 'BB', 'UV', 'II', 'III', 'XL', 'XXL', 'LA', 'AH', 'DS', 'BO', 'CY', 'LB', 'CZ', 'SET', 'MAS', 'MÁS', 'N2', '3N', 'BIF', 'UPG', 'INF', 'ESS', 'EDP', 'EDT', 'SPF', 'FPS']);
/** Palabras de la factura que no son parte del nombre: desde aquí se corta */
const STOP = /^(FLETE|SUBTOTAL|SUBTOT|SUB|IMPORTE|DESCUENTO)$/;
/** Restos de columnas de la factura ("UNIDAD (BIENES)") que se quitan donde aparezcan */
const DROP = /^I?B?I?E?NES\)?$|^\(?BIENES|^U?NIDA?D?\.?$|^SERVICIOS$/;
const ALL = [...VOCAB];

/** Letras que el OCR confunde con números (y al revés) en palabras */
const toLetters = (w: string) => w.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/2/g, 'Z').replace(/6/g, 'G').replace(/[:;|!]/g, 'I');

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

/** Palabra del diccionario más parecida (o null si ninguna es claramente la misma) */
function closest(w: string): string | null {
  if (VOCAB.has(w)) return w;
  const l = toLetters(w);
  if (VOCAB.has(l)) return l;
  if (l.length < 4 || !/^[A-ZÁÉÍÓÚÑÜ]+$/.test(l)) return null;
  const max = l.length >= 7 ? 2 : 1;
  let best: string | null = null, bestD = max + 1, tie = false;
  for (const v of ALL) {
    if (v.length < 4) continue;
    // con 2 letras de diferencia, debe empezar igual ("PARCIAL" no es "FACIAL")
    const lim = l[0] === v[0] ? max : 1;
    const d = distance(l, v, lim);
    if (d > lim) continue;
    if (d < bestD) { best = v; bestD = d; tie = false; } else if (d === bestD && best && v !== best && v.normalize('NFD').replace(/[̀-ͯ]/g, '') !== best.normalize('NFD').replace(/[̀-ͯ]/g, '')) tie = true;
  }
  return best && bestD <= max && !tie ? best : null;
}

/** "PERFUMADOROLLONMUJER" → ["PERFUMADO", "ROLLON", "MUJER"] (el resto corto que sobra se descarta) */
function split(w: string, depth = 0): string[] | null {
  const l = toLetters(w);
  if (l.length < (depth ? 5 : 7) || depth > 3) return null;
  for (let i = l.length - 1; i >= 3; i--) {
    const a = l.slice(0, i);
    if (!VOCAB.has(a)) continue;
    const rest = l.slice(i);
    if (VOCAB.has(rest) || SHORT_OK.has(rest)) return [a, rest];
    const near = rest.length >= 4 ? closest(rest) : null;
    if (near) return [a, near];
    const deeper = split(rest, depth + 1);
    if (deeper) return [a, ...deeper];
    if (rest.length <= 3) return [a];
  }
  return null;
}

const SIZE = /^(\d+([.,]\d+)?(ML|G|GR|L|LT|OZ|KG|MG)?|C\d{1,2}([/-]\d{2,4})?|C\d{1,2}-\d{4}|N\d|\d+N|\d+(TO|DA|RA|ER|DO)|FPS\d+|SPF\d+)$/;
const isWord = (w: string) => VOCAB.has(w) || SHORT_OK.has(w) || SIZE.test(w);

/** Corrige números pegados a la unidad: "SO ML" → "50 ML", "SOG"/"506" → "50 G", "$0" → "50" */
function fixSizes(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    const next = words[i + 1] || '';
    if (/^(ML|G|GR|L)$/.test(next) && /^[\dSOIZB$]{1,4}$/.test(w) && /\d/.test(w.replace(/[SOIZB$]/g, m => ({ S: '5', O: '0', I: '1', Z: '2', B: '8', $: '5' }[m]!)))) {
      w = w.replace(/[SOIZB$]/g, m => ({ S: '5', O: '0', I: '1', Z: '2', B: '8', $: '5' }[m]!));
    }
    const m = /^([\dSO$]{2,3})(G|ML)$/.exec(w) || /^(\d{2})(6)$/.exec(w);
    if (m && /^(5|S|\$)[0O]$|^\d+$/.test(m[1])) {
      const n = m[1].replace(/S|\$/g, '5').replace(/O/g, '0');
      out.push(n, m[2] === '6' ? 'G' : m[2]);
      continue;
    }
    out.push(w);
  }
  return out;
}

/** Corrige y limpia las palabras (en MAYÚSCULAS) del nombre de un producto */
export function fixNameWords(words: string[]): string[] {
  let ws: string[] = [];
  const upper = words.map(w => w.toUpperCase());
  const stopAt = upper.findIndex((w, i) => i > 0 && STOP.test(w));
  for (const raw of fixSizes(stopAt > 0 ? upper.slice(0, stopAt) : upper)) {
    if (STOP.test(raw) || DROP.test(raw)) continue;
    const fixed = closest(raw);
    if (fixed) { ws.push(fixed); continue; }
    const parts = split(raw);
    if (parts) { ws.push(...parts); continue; }
    ws.push(raw);
  }
  // Basura al inicio y al final: palabras cortas o mezclas raras que no están en el diccionario
  const junk = (w: string) => !isWord(w) && (w.length <= 3 || /(.)\1\1/.test(w) || (/\d/.test(w) && /[A-Z]/.test(w)) || !/[AEIOUÁÉÍÓÚ]/.test(w));
  while (ws.length > 1 && junk(ws[0])) ws.shift();
  while (ws.length > 1 && junk(ws[ws.length - 1])) ws.pop();
  // "BOLETIN ENTRENOS C12 BOLETINENTRENOSC122": el nombre repetido sin espacios
  if (ws.length > 2) {
    const head = (ws[0] + ws[1]).replace(/[^A-Z]/g, '');
    ws = ws.filter((w, i) => i < 2 || !(w.length >= 8 && w.replace(/[^A-Z]/g, '').startsWith(head)));
  }
  return ws;
}

export const isKnownWord = (w: string) => VOCAB.has(w.toUpperCase());

/** Qué tan "limpio" es un nombre: parte de sus palabras que son conocidas (0 a 1) */
export function nameScore(name: string): number {
  const ws = name.toUpperCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return 0;
  return ws.filter(w => isWord(w) || isWord(toLetters(w))).length / ws.length;
}
