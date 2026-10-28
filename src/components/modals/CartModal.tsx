import { FileText, MessageCircle } from 'lucide-react';
import Modal, { CloseButton } from '../Modal';
import { closeModal, setState, toast, useStore } from '../../store';
import { sendCartWhatsApp } from '../../actions';
import { cardImage, formatContent, formatUSD } from '../../lib/format';
import { exportCartToPDF } from '../../lib/exporters';

export default function CartModal() {
  const cart = useStore(s => s.cart);
  const records = useStore(s => s.records);
  const lines = cart.map(l => ({ line: l, r: records.find(x => x.id === l.id) })).filter(x => x.r);
  const total = lines.reduce((a, { line, r }) => a + Number(r!.sale_price) * line.qty, 0);

  const setQty = (id: string, qty: number) => {
    setState({ cart: qty < 1 ? cart.filter(x => x.id !== id) : cart.map(x => (x.id === id ? { ...x, qty } : x)) });
  };

  return (
    <Modal id="cart-modal">
      <article className="modal-card w-full max-w-md bg-white rounded-3xl p-6 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-xl hero-title">Tu Pedido</h2><CloseButton onClick={() => closeModal('cart-modal')} /></div>
        <div id="cart-list" className="flex-1 overflow-y-auto space-y-3 pr-1">
          {lines.map(({ line, r }) => (
            <div key={line.id} className="flex items-center gap-3 border border-[#eee7f1] rounded-2xl p-3 bg-white shadow-sm">
              <img src={cardImage(r!)} alt={r!.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{r!.name}</p>
                <p className="text-xs text-[#756c7e]">{formatUSD(r!.sale_price)}{formatContent(r!) ? ` · ${formatContent(r!)}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="w-7 h-7 rounded-full bg-[#f1ebf5] grid place-items-center hover:bg-[#e8dfec]" type="button" onClick={() => setQty(line.id, line.qty - 1)}>−</button>
                <span className="text-sm font-bold w-4 text-center">{line.qty}</span>
                <button className="w-7 h-7 rounded-full bg-[#f1ebf5] grid place-items-center hover:bg-[#e8dfec]" type="button" onClick={() => { if (line.qty < r!.stock) setQty(line.id, line.qty + 1); else toast('Stock máximo.'); }}>+</button>
              </div>
            </div>
          ))}
        </div>
        {lines.length === 0 ? (
          <p id="cart-empty" className="text-center py-8 text-sm text-[#756c7e]">El carrito está vacío.</p>
        ) : (
          <div id="cart-footer" className="border-t border-[#ede7f0] mt-5 pt-4 space-y-3">
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span id="cart-total" className="hero-title text-[#7c43ba]">{formatUSD(total)}</span></div>
            <button type="button" onClick={sendCartWhatsApp} className="w-full py-3.5 rounded-xl font-bold btn-whatsapp flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Enviar por WhatsApp</button>
            <button type="button" onClick={exportCartToPDF} className="w-full py-3 rounded-xl font-bold btn-primary flex items-center justify-center gap-2"><FileText className="w-5 h-5" /> Descargar PDF</button>
            <button type="button" onClick={() => { if (confirm('¿Vaciar carrito?')) { setState({ cart: [] }); toast('Carrito vaciado'); } }} className="w-full py-2 rounded-xl text-sm text-[#756c7e] hover:bg-[#f6f1f8]">Vaciar carrito</button>
          </div>
        )}
      </article>
    </Modal>
  );
}
