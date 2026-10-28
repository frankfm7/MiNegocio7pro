import { useStore } from '../store';

export default function Toast() {
  const msg = useStore(s => s.toastMsg);
  const show = useStore(s => s.toastShow);
  return (
    <div id="toast" className={`toast fixed left-1/2 bottom-24 lg:bottom-7 z-[10001] text-white px-5 py-3 rounded-full text-sm font-medium max-w-[90vw] text-center ${show ? 'show' : ''}`} role="status">
      {msg}
    </div>
  );
}
