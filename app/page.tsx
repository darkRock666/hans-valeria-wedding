"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, CheckCircle2, Heart, LoaderCircle, MapPin, MessageCircle } from "lucide-react";
import { weddingWhatsAppUrl } from "@/lib/whatsapp";

import WeddingMusic from "./components/WeddingMusic";
import {EnvelopeIntro, InteractiveGallery, WeddingFaq} from "./components/InvitationExperience";

const weddingDate = new Date("2026-12-26T16:00:00-04:00").getTime();
const mapsUrl = "https://maps.app.goo.gl/UnmmoXjr3qRvyS9n8";
const calendarDays = Array.from({ length: 35 }, (_, i) => i > 0 && i < 32 ? i : null);

function FloralMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 72 84" fill="none" aria-hidden="true"><path d="M36 79V34M36 64C21 64 13 55 14 43C27 43 35 51 36 64ZM36 52C50 52 59 43 58 31C45 31 37 40 36 52ZM36 34C25 29 22 17 29 8C39 15 42 24 36 34ZM36 34C47 29 50 17 43 8C33 15 30 24 36 34Z" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Countdown() {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, weddingDate - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const units = remaining === null ? ["—", "—", "—", "—"] : [Math.floor(remaining / 86400000), Math.floor((remaining % 86400000) / 3600000), Math.floor((remaining % 3600000) / 60000), Math.floor((remaining % 60000) / 1000)].map(value => String(value).padStart(2, "0"));
  return <div className="countdown-wrap"><p className="eyebrow">Cada vez falta menos</p><div className="countdown" role="timer" aria-label="Cuenta regresiva hasta nuestra boda">{units.map((value, i) => <div className="countdown-unit" key={i}><span className="countdown-number">{value}</span><span className="countdown-label">{["días", "horas", "minutos", "segundos"][i]}</span></div>)}</div></div>;
}

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => { const n = Math.floor(Math.random() * 16); return (character === "x" ? n : (n & 3) | 8).toString(16); });
}

function RsvpForm() {
  const [name, setName] = useState("");
  const [attendance, setAttendance] = useState<"yes" | "no">("yes");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (status === "saved") savedRef.current?.focus(); }, [status]);
  function edited() { requestId.current = null; setStatus("idle"); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "saving" || !formRef.current?.reportValidity()) return;
    if (name.trim().length < 2) { setError("Escribe tu nombre completo para identificar tu respuesta."); setStatus("error"); return; }
    const count = attendance === "yes" ? 1 : 0;
    requestId.current ??= newRequestId(); setStatus("saving"); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch("/api/rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), attendance, guests: count, requestId: requestId.current, website, message }), signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new Error(response.status === 429 ? "Espera un momento y vuelve a intentarlo." : "No pudimos guardar tu respuesta. Inténtalo de nuevo en un momento.");
      setStatus("saved");
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error && !(reason instanceof TypeError) && reason.name !== "AbortError" && reason.message !== "Failed to fetch" ? reason.message : "No pudimos confirmar que tu respuesta se guardó. Revisa tu conexión y vuelve a intentarlo.");
    } finally { window.clearTimeout(timeout); }
  }
  if (status === "saved") return <div className="rsvp-success" ref={savedRef} tabIndex={-1} role="status" aria-live="polite">
    <span className="success-icon"><CheckCircle2 size={30} strokeWidth={1.3} /></span>
    <p className="eyebrow" style={{ overflowWrap: "anywhere" }}>Gracias, {name.trim()}.</p>
    <h3>{attendance === "yes" ? "¡Confirmado!" : "Respuesta registrada"}</h3>
    <p>{attendance === "yes" ? "Tu asistencia a la boda de Hans & Valeria quedó registrada. ¡Nos vemos el 26 de diciembre!" : "Guardamos tu respuesta. Gracias por avisarnos que no podrás acompañarnos."}</p>
    <span className="success-signature">Con cariño, Hans & Valeria</span>
    <div className="whatsapp-confirmation">
      <a className="button button-navy whatsapp-confirmation-button" href={weddingWhatsAppUrl({ name, attendance, message })} target="_blank" rel="noopener noreferrer" aria-describedby="whatsapp-confirmation-help"><MessageCircle size={19} strokeWidth={1.4} aria-hidden="true" /><span>Enviar también por WhatsApp</span></a>
      <p id="whatsapp-confirmation-help">Tu respuesta ya está guardada. Este botón abre el mensaje en WhatsApp; toca <strong>Enviar</strong> allí para mandarlo.</p>
    </div>
  </div>;
  return <form className="rsvp-form" ref={formRef} onSubmit={submit} aria-labelledby="form-title">
    <div className="form-heading"><Heart size={23} strokeWidth={1.2} aria-hidden="true" /><h3 id="form-title">Confirma tu asistencia</h3></div>
    <p className="form-intro">Nos hará ilusión saber de ti.</p>
    <fieldset disabled={status === "saving"}>
      <div className="form-field"><label htmlFor="guest-name">Nombre completo <span aria-hidden="true">*</span></label><input id="guest-name" name="name" autoComplete="name" placeholder="Escribe tu nombre y apellido" required minLength={2} maxLength={100} value={name} onChange={event => { setName(event.target.value); edited(); }} /></div>
      <fieldset className="attendance-field"><legend>¿Nos acompañarás? <span aria-hidden="true">*</span></legend><div className="attendance-options">
        <label className={`attendance-option ${attendance === "yes" ? "selected" : ""}`}><input type="radio" name="attendance" value="yes" checked={attendance === "yes"} onChange={() => { setAttendance("yes"); edited(); }} /><span className="radio-indicator">{attendance === "yes" && <Check size={13} strokeWidth={2} />}</span><span>Sí, estaré allí</span></label>
        <label className={`attendance-option ${attendance === "no" ? "selected" : ""}`}><input type="radio" name="attendance" value="no" checked={attendance === "no"} onChange={() => { setAttendance("no"); edited(); }} /><span className="radio-indicator">{attendance === "no" && <Check size={13} strokeWidth={2} />}</span><span>No podré asistir</span></label>
      </div></fieldset>
      <div className="form-field message-field"><label htmlFor="guest-message">Un mensaje para los novios <small>(opcional)</small></label><textarea id="guest-message" name="message" rows={3} maxLength={500} placeholder="Déjanos unas palabras con cariño…" value={message} onChange={event => { setMessage(event.target.value); edited(); }} /><p className="message-help">Lo leeremos con mucho cariño.</p></div>
      <div className="website-field" aria-hidden="true"><label htmlFor="website">Sitio web</label><input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="button button-navy submit-button" disabled={status === "saving"}>{status === "saving" ? <><LoaderCircle className="spinning" size={18} /> Guardando respuesta…</> : <>Enviar confirmación <Heart size={17} strokeWidth={1.4} /></>}</button>
    </fieldset>
    <p className="form-note">Tu respuesta se compartirá únicamente con los novios.</p>
  </form>;
}

export default function Home() {
  return <main className="invitation" id="inicio">
    <EnvelopeIntro />
    <a className="skip-link" href="#celebracion">Ir a los detalles de la boda</a>
    <header className="site-header"><a className="header-monogram" href="#inicio" aria-label="Hans y Valeria, inicio">H<span>/</span>V</a><span className="header-date">26.12.2026</span><nav aria-label="Navegación principal"><a href="#celebracion">Los detalles</a><a href="#confirmar" className="header-rsvp">Confirmar asistencia</a></nav></header>
    <section className="hero" aria-labelledby="wedding-title">
      <img className="hero-floral" src="/images/floral.webp" alt="" fetchPriority="high" />
      <div className="hero-shade" /><div className="hero-frame" aria-hidden="true" />
      <div className="hero-content"><p className="eyebrow hero-eyebrow"><span /> Nuestra boda <span /></p><h1 id="wedding-title"><span className="hero-first-name">Hans</span><span className="hero-ampersand">&</span><span className="hero-second-name">Valeria</span></h1><p className="hero-message">Un sí para siempre.<br />Un día para compartir contigo.</p><div className="hero-date"><span>Sábado, 26 de diciembre de 2026</span><span className="hero-date-location">4:00 p. m. <i /> La Paz, Bolivia</span></div><a href="#confirmar" className="button button-blush">Confirmar asistencia <Heart size={17} strokeWidth={1.3} aria-hidden="true" /></a></div>
      <p className="hero-side-note" aria-hidden="true">HANS & VALERIA — 26 DICIEMBRE 2026</p><a href="#momentos" className="discover-link">Nuestra invitación<span aria-hidden="true" /></a>
    </section>
    <div className="palette-ribbon"><FloralMark className="ribbon-branch" /><p>Un día, un sí y toda una vida.</p><FloralMark className="ribbon-branch" /></div>
    <section className="moments-section paper-section" id="momentos" aria-labelledby="moments-title"><div className="moments-intro"><p className="eyebrow">Hans & Valeria</p><h2 id="moments-title">Nuestro momento.</h2><span className="fine-rule" aria-hidden="true" /></div><InteractiveGallery /><p className="gallery-hint">Tres instantes. Un mismo para siempre.</p></section>
    <section className="date-section paper-section" id="celebracion" aria-labelledby="date-title">
      <div className="section-intro"><FloralMark className="floral-mark" /><p className="eyebrow">Con mucha ilusión</p><h2 id="date-title">El comienzo de<br /><em>nuestro para siempre.</em></h2><p>Hay momentos que se vuelven inolvidables<br className="desktop-break" /> por las personas con quienes los compartimos.<br className="desktop-break" /> Te invitamos a celebrar el nuestro.</p></div>
      <div className="date-composition"><div className="date-story"><p className="eyebrow">Reserva este día</p><div className="editorial-date"><span className="date-day">26</span><div><span>Sábado</span><strong>Diciembre</strong><span>2026</span></div></div><p className="time-line">A las 4:00 p. m. <span>· Hora de La Paz</span></p><a className="text-button calendar-button" href="/Hans-y-Valeria.ics" download><CalendarDays size={18} strokeWidth={1.3} /> Guardar la fecha</a></div><div className="wedding-calendar" aria-label="Calendario de diciembre de 2026. Nuestra boda es el sábado 26."><p className="calendar-month">Diciembre <span>2026</span></p><div className="calendar-grid" aria-hidden="true">{["L", "M", "X", "J", "V", "S", "D"].map((day, i) => <span className="calendar-weekday" key={`day-${i}`}>{day}</span>)}{calendarDays.map((day, i) => <span className={day === 26 ? "calendar-day wedding-day" : "calendar-day"} key={i}>{day === 26 ? <><Heart className="calendar-heart" size={40} strokeWidth={0.9} /><b>{day}</b></> : day}</span>)}</div><span className="calendar-caption">Nuestro día favorito</span></div></div>
      <Countdown />
    </section>
    <section className="venue-section" id="ubicacion" aria-labelledby="venue-title"><div className="venue-decoration" aria-hidden="true"><span>H</span><i>&</i><span>V</span></div><div className="venue-content"><span className="venue-icon"><MapPin size={26} strokeWidth={1.1} aria-hidden="true" /></span><p className="eyebrow">El lugar de nuestro encuentro</p><h2 id="venue-title">La celebración</h2><p className="venue-name">Tu Spazio</p><p className="venue-neighborhood">Salón & Jardín de Eventos</p><address>C. 6 127, Obrajes<br />Nuestra Señora de La Paz, Bolivia</address><div className="venue-time"><span>26 de diciembre de 2026</span><i /><span>4:00 p. m.</span></div><a className="button button-blush" href={mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={18} strokeWidth={1.4} aria-hidden="true" /> Cómo llegar</a><p className="maps-note">Abre la ubicación en Google Maps</p></div></section>
    <section className="rsvp-section paper-section" id="confirmar" aria-labelledby="rsvp-title"><div className="rsvp-copy"><span className="small-ornament" aria-hidden="true">✦</span><p className="eyebrow">Tu presencia es nuestro regalo</p><h2 id="rsvp-title">La mejor parte<br />es <em>compartirlo.</em></h2><p>Estamos preparando un día muy especial.<br className="desktop-break" /> Cuéntanos si nos acompañarás para<br className="desktop-break" /> celebrar juntos este nuevo comienzo.</p><div className="rsvp-signature">Te esperamos con todo el corazón.<span>Hans & Valeria</span></div></div><RsvpForm /></section>
    <section className="dress-code-section" id="dress-code" aria-labelledby="dress-code-title">
      <div className="dress-code-card">
        <FloralMark className="dress-code-floral" />
        <p className="eyebrow">Dress code</p>
        <h2 id="dress-code-title">Cóctel semiformal <em>elegante</em></h2>
        <span className="fine-rule" aria-hidden="true" />
        <p>Acompáñanos a celebrar con tu mejor actitud y estilo. Por favor, evita asistir de blanco —ese tono lo guardamos en exclusividad para la novia— y elige colores con los que brillen juntos en esta noche tan importante.</p>
      </div>
    </section>
    <WeddingFaq />
    <footer className="site-footer"><a className="footer-monogram" href="#inicio" aria-label="Volver al inicio">H<span>&</span>V</a><p>El amor nos reúne.</p><span>26 de diciembre de 2026 · La Paz, Bolivia</span></footer>
    <WeddingMusic />
  </main>;
}
