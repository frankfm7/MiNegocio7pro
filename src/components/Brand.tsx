/** Nombre de la app: "MiNegocio" normal y "7Pro" con el efecto dorado metálico */
export default function Brand({ bright = false }: { bright?: boolean }) {
  return <>MiNegocio<span className={`font-black ${bright ? 'gold-text-bright' : 'gold-text'}`}>7Pro</span></>;
}
