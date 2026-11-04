"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export function DevelopmentPaywallDialog({ onClose }: { onClose: () => void }) {
  const [prankRevealed, setPrankRevealed] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, []);

  return <div className="modal-backdrop development-paywall-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="modal development-paywall-modal" role="dialog" aria-modal="true" aria-labelledby="development-paywall-title" aria-describedby="development-paywall-description">
      <div className="modal-head">
        <div><span className="development-paywall-kicker">Akses fitur</span><h2 id="development-paywall-title">{prankRevealed ? "Ups, kena prank!" : "Buka fitur ini"}</h2></div>
        <button ref={closeButtonRef} type="button" className="icon-button modal-close" onClick={onClose} aria-label="Tutup dialog"><Icon name="close" /></button>
      </div>
      {prankRevealed ? <div className="development-prank-reveal" id="development-paywall-description" role="status">
        <span className="development-prank-icon"><Icon name="sparkles" size={22} /></span>
        <strong>Kena prank!</strong>
        <p>Tidak ada pembayaran yang diproses. Fitur ini masih dalam pengembangan.</p>
      </div> : <>
        <p className="development-paywall-intro" id="development-paywall-description">Menu ini sedang disiapkan untuk membantu pekerjaan tim Anda.</p>
        <div className="development-paywall-offer">
          <div className="development-paywall-brand"><div className="development-dana-logo"><img src="/dana-logo.png" alt="DANA" /></div><span>Simulasi akses premium</span></div>
          <div className="development-paywall-price"><small>Harga pembukaan</small><strong>Rp2.500.000</strong><span>Sekali bayar</span></div>
        </div>
        <p className="development-paywall-note"><Icon name="info" size={14} />Ini hanya simulasi UI. Tidak ada transaksi atau perubahan akses.</p>
        <div className="modal-actions development-paywall-actions"><button type="button" className="button button-ghost" onClick={onClose}>Nanti saja</button><button type="button" className="button button-primary" onClick={() => setPrankRevealed(true)}><Icon name="lock" size={14} />Bayar via DANA</button></div>
      </>}
      {prankRevealed && <div className="modal-actions"><button type="button" className="button button-primary" onClick={onClose}>Mengerti</button></div>}
    </section>
  </div>;
}
