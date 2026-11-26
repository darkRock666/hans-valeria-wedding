"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./panel.module.css";

type Row = { requestId: string; name: string; attendance: "yes" | "no"; guests: number; message: string; createdAt: string };
type Data = { rows: Row[]; totals: { responses: number; yes: number; no: number }; truncated: boolean; limit: number };

function localDate(value: string) {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(iso));
}

export default function GuestsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/rsvps", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json() as Data & { error?: string };
      if (response.status === 401) { setNeedsLogin(true); setData(null); return; }
      if (!response.ok) throw new Error(body.error || "No pudimos cargar las confirmaciones.");
      setData(body);
      setNeedsLogin(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar. Intenta otra vez."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ password }),
      });
      const body = await response.json() as { error?: string };
      setPassword("");
      if (!response.ok) throw new Error(body.error || "No pudimos iniciar la sesión.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar. Intenta otra vez."); setLoading(false); }
  }

  async function logout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("No pudimos cerrar la sesión. Intenta otra vez.");
      setData(null);
      setNeedsLogin(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos conectar."); }
    finally { setLoading(false); }
  }

  const filtered = useMemo(() => data?.rows.filter((row) => row.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))) || [], [data, search]);

  return (
    <main className={styles.panel}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div><a className={styles.brand} href="/">H <span>&</span> V</a><p className={styles.eyebrow}>26 de diciembre de 2026</p></div>
          <a className={styles.back} href="/">Ver invitación</a>
        </header>
        <div className={styles.heading}><p className={styles.eyebrow}>Hans & Valeria · Acceso privado</p><h1>Nuestros invitados</h1><p>Un lugar para reunir cada respuesta y preparar este día con ilusión.</p></div>

        {error && <p className={styles.error} role="alert">{error}</p>}

        {needsLogin ? (
          <form className={styles.login} onSubmit={login}>
            <div className={styles.lock} aria-hidden="true">♡</div>
            <h2>Bienvenidos a su lista</h2>
            <p>Ingresen su clave privada para consultar las confirmaciones.</p>
            <label htmlFor="admin-password">Clave de acceso</label>
            <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} maxLength={512} />
            <button disabled={loading} type="submit">{loading ? "Ingresando…" : "Entrar a mi lista"}</button>
          </form>
        ) : data ? (
          <>
            <section className={styles.stats} aria-label="Resumen de confirmaciones">
              <div><strong>{data.totals.yes}</strong><span>Asistentes confirmados</span></div>
              <div><strong>{data.totals.no}</strong><span>Respuestas «No»</span></div>
              <div><strong>{data.totals.responses}</strong><span>Respuestas recibidas</span></div>
            </section>
            <section className={styles.list} aria-label="Lista de respuestas">
              <div className={styles.toolbar}>
                <div><label htmlFor="guest-search">Buscar por nombre</label><input id="guest-search" type="search" placeholder="Nombre del invitado" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
                <div className={styles.actions}><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button><a href="/api/admin/rsvps?format=csv" download>Descargar CSV</a></div>
              </div>
              {data.truncated && <p className={styles.notice}>Se muestran las últimas {data.limit} respuestas. El resumen incluye todas las confirmaciones.</p>}
              <div className={styles.tableWrap}><table><thead><tr><th scope="col">Nombre</th><th scope="col">Asistencia</th><th scope="col">Mensaje privado</th><th scope="col">Respondió</th></tr></thead><tbody>
                {filtered.map((row) => <tr key={row.requestId}><td>{row.name}</td><td><span className={row.attendance === "yes" ? styles.yes : styles.no}>{row.attendance === "yes" ? "Sí asistiré" : "No podré asistir"}</span></td><td className={styles.message}>{row.message || "—"}</td><td>{localDate(row.createdAt)}</td></tr>)}
              </tbody></table></div>
              {!filtered.length && <div className={styles.empty}><p>{search ? "No hay respuestas con ese nombre." : "Las confirmaciones aparecerán aquí cuando sus invitados respondan."}</p></div>}
              <p className={styles.footnote}>Cada respuesta corresponde a una invitación personal. Las fechas se muestran en horario de La Paz.</p>
            </section>
            <button className={styles.logout} type="button" onClick={() => void logout()} disabled={loading}>Cerrar sesión privada</button>
          </>
        ) : (
          <div className={styles.loading} role="status">{loading ? "Cargando sus confirmaciones…" : <button type="button" onClick={() => void load()}>Volver a intentar</button>}</div>
        )}
        <footer className={styles.footer}>Con amor, Hans & Valeria</footer>
      </div>
    </main>
  );
}
