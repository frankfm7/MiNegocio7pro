
/** Renderiza un bloque HTML fuera de pantalla y lo convierte en PNG */
export async function htmlToImage(html: string): Promise<string> {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;background:white;padding:30px;font-family:Arial,sans-serif;';
  tempDiv.innerHTML = html;
  document.body.appendChild(tempDiv);
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(tempDiv, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
    return canvas.toDataURL('image/png', 1.0);
  } finally {
    if (document.body.contains(tempDiv)) document.body.removeChild(tempDiv);
  }
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
