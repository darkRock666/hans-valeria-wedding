"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { Heart, Plus, X } from "lucide-react";

const sessionKey = "hv-opened-v1";
const photos = [
  { id: 3, width: 1000, height: 1500 },
  { id: 1, width: 1000, height: 1500 },
  { id: 2, width: 994, height: 1583 },
];

function rememberOpening() {
  try { sessionStorage.setItem(sessionKey, "1"); } catch { /* Browsing still works when storage is unavailable. */ }
}

function focusInvitation() {
  requestAnimationFrame(() => {
    const heading = document.getElementById("wedding-title");
    if (!heading) return;
    const addedTabIndex = !heading.hasAttribute("tabindex");
    if (addedTabIndex) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    if (addedTabIndex) heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
  });
}

export function EnvelopeIntro() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<number | null>(null);
  const shownRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (shownRef.current) return;
    const hash = window.location.hash;
    if (hash && hash !== "#inicio") return;
    try { if (sessionStorage.getItem(sessionKey) === "1") return; } catch { /* The invitation needs no storage permission. */ }
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== "function") return;
    try { dialog.showModal(); shownRef.current = true; } catch { /* Keep the page usable if a modal cannot open. */ }
    return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, []);

  function closeIntro() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    rememberOpening();
    dialogRef.current?.close();
  }

  function openInvitation() {
    if (opening) return;
    window.dispatchEvent(new Event("hv:open-invitation"));
    rememberOpening();
    setOpening(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timerRef.current = window.setTimeout(closeIntro, reducedMotion ? 0 : 650);
  }

  return (
    <dialog
      ref={dialogRef}
      className={`envelope-dialog${opening ? " is-opening" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={() => { rememberOpening(); setOpening(false); focusInvitation(); }}
    >
      <button type="button" className="envelope-close" aria-label="Cerrar introducción y ver la invitación" onClick={() => { window.dispatchEvent(new Event("hv:open-invitation")); closeIntro(); }}><X size={20} aria-hidden="true" /></button>
      <div className="envelope-scene">
        <p className="envelope-eyebrow">Una invitación para ti</p>
        <div className="envelope-art" aria-hidden="true">
          <div className="envelope-back" />
          <div className="envelope-letter"><span>H<span>&</span>V</span><i>26 · 12 · 2026</i></div>
          <div className="envelope-side envelope-side-left" />
          <div className="envelope-side envelope-side-right" />
          <div className="envelope-front" />
          <div className="envelope-flap" />
          <span className="envelope-seal"><Heart size={22} strokeWidth={1.2} /></span>
        </div>
        <h2 className="envelope-title" id={titleId}>Hans <span>&</span> Valeria</h2>
        <p className="envelope-date">26 de diciembre de 2026</p>
        <p className="envelope-description" id={descriptionId}>Tenemos un día muy especial para compartir contigo.</p>
        <button type="button" className="button button-blush envelope-open" onClick={openInvitation} disabled={opening} autoFocus>{opening ? "Abriendo invitación…" : "Abrir invitación"}</button>
      </div>
    </dialog>
  );
}

export function InteractiveGallery() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const photo = active === null ? null : photos[active];

  function openPhoto(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setActive(index);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  function move(direction: number) { setActive(index => index === null ? null : (index + direction + photos.length) % photos.length); }

  function keyboard(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
  }

  function touchStart(event: TouchEvent<HTMLDivElement>) {
    touchRef.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }

  function touchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1);
  }

  return <>
    <div className="photo-gallery" tabIndex={0} aria-label="Fotografías de Hans y Valeria. Desliza para ver más o toca una para ampliarla.">
      {photos.map((item, index) => <button type="button" className={`couple-photo photo-${index}`} key={item.id} aria-label={`Ampliar fotografía ${index + 1} de ${photos.length}, Hans y Valeria`} onClick={event => openPhoto(index, event.currentTarget)}><img src={`/images/pareja-${item.id}.webp`} alt={`Hans y Valeria, fotografía ${index + 1}`} width={item.width} height={item.height} loading="lazy" /><span className="photo-enlarge-label">Ver fotografía</span></button>)}
    </div>
    <dialog
      ref={dialogRef}
      className="photo-lightbox"
      aria-labelledby={titleId}
      onKeyDown={keyboard}
      onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      onClose={() => { setActive(null); requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true })); }}
    >
      <div className="lightbox-content">
        <div className="lightbox-header"><h2 id={titleId}>Hans & Valeria</h2><button type="button" className="lightbox-close" aria-label="Cerrar fotografía ampliada" onClick={() => dialogRef.current?.close()} autoFocus><X size={24} aria-hidden="true" /></button></div>
        <div className="lightbox-image-wrap" onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={() => { touchRef.current = null; }}>
          {photo && <img className="lightbox-image" src={`/images/pareja-${photo.id}.webp`} alt={`Fotografía ampliada de Hans y Valeria, ${(active ?? 0) + 1} de ${photos.length}`} width={photo.width} height={photo.height} />}
        </div>
        <div className="lightbox-controls"><button type="button" className="lightbox-prev" onClick={() => move(-1)} aria-label="Ver fotografía anterior">Anterior</button><span className="lightbox-index" aria-live="polite">{(active ?? 0) + 1} / {photos.length}</span><button type="button" className="lightbox-next" onClick={() => move(1)} aria-label="Ver fotografía siguiente">Siguiente</button></div>
      </div>
    </dialog>
  </>;
}

export function WeddingFaq() {
  const titleId = useId();
  return <section className="faq-section" id="preguntas" aria-labelledby={titleId}>
    <div className="faq-heading"><p className="eyebrow">Todo para acompañarnos</p><h2 id={titleId}>Los pequeños detalles.</h2><span className="fine-rule" aria-hidden="true" /></div>
    <div className="faq-list">
      <details className="faq-item" name="wedding-faq"><summary className="faq-summary">¿Cuándo es la boda?<Plus className="faq-icon" size={18} aria-hidden="true" /></summary><div className="faq-answer"><p>El sábado 26 de diciembre de 2026, a las 4:00 p. m., hora de La Paz, Bolivia (UTC−04:00).</p></div></details>
      <details className="faq-item" name="wedding-faq"><summary className="faq-summary">¿Dónde nos encontramos?<Plus className="faq-icon" size={18} aria-hidden="true" /></summary><div className="faq-answer"><p>En Tu Spazio — Salón & Jardín de Eventos, C. 6 127, Obrajes, La Paz, Bolivia.</p><a href="https://maps.app.goo.gl/UnmmoXjr3qRvyS9n8" target="_blank" rel="noopener noreferrer">Ver ubicación en Google Maps</a></div></details>
      <details className="faq-item" name="wedding-faq"><summary className="faq-summary">¿La invitación es personal?<Plus className="faq-icon" size={18} aria-hidden="true" /></summary><div className="faq-answer"><p>Sí. Esta invitación corresponde a una sola persona. Confirma únicamente tu asistencia.</p></div></details>
      <details className="faq-item" name="wedding-faq"><summary className="faq-summary">¿Cómo confirmo mi respuesta?<Plus className="faq-icon" size={18} aria-hidden="true" /></summary><div className="faq-answer"><p>Escribe tu nombre completo, dinos si nos acompañarás y envía el formulario. Verás «Respuesta registrada» cuando se haya guardado correctamente.</p><a href="#confirmar">Ir a confirmar asistencia</a></div></details>
    </div>
  </section>;
}
