"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Music2, Pause } from "lucide-react";

export default function WeddingMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const actionRef = useRef(0);
  const startingRef = useRef(false);
  const errorId = useId();
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const controlMusic = useCallback(async (onlyStart = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (onlyStart && (!audio.paused || startingRef.current)) return;

    const action = ++actionRef.current;
    setError("");
    if (!audio.paused || startingRef.current) {
      startingRef.current = false;
      audio.pause();
      setPending(false);
      return;
    }

    startingRef.current = true;
    setPending(true);
    audio.volume = 0.35;

    // Start within the opening tap so mobile browsers allow sound.
    if (!audio.getAttribute("src") || audio.error) {
      audio.src = "/audio/boda.mp3";
      audio.load();
    }

    try {
      await audio.play();
    } catch {
      if (action === actionRef.current) {
        setPending(false);
        setError("No se pudo reproducir la música. Toca para intentar de nuevo.");
      }
    } finally {
      if (action === actionRef.current) startingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onOpen = () => { void controlMusic(true); };
    window.addEventListener("hv:open-invitation", onOpen);
    return () => window.removeEventListener("hv:open-invitation", onOpen);
  }, [controlMusic]);

  return (
    <div className="music-player" data-playing={playing ? "true" : "false"}>
      <audio
        ref={audioRef}
        preload="none"
        loop
        onPlaying={() => {
          startingRef.current = false;
          setPlaying(true);
          setPending(false);
          setError("");
        }}
        onWaiting={() => setPending(true)}
        onPause={() => {
          startingRef.current = false;
          setPlaying(false);
          setPending(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setPending(false);
        }}
        onError={() => {
          startingRef.current = false;
          setPlaying(false);
          setPending(false);
          setError("No se pudo cargar la música. Toca para intentar de nuevo.");
        }}
      />
      <button
        type="button"
        className="music-toggle"
        onClick={() => { void controlMusic(); }}
        aria-label={playing || pending ? "Pausar música" : "Reproducir música de la invitación"}
        aria-pressed={playing}
        aria-busy={pending}
        aria-describedby={error ? errorId : undefined}
      >
        {playing || pending ? <Pause size={17} strokeWidth={1.5} aria-hidden="true" /> : <Music2 size={17} strokeWidth={1.5} aria-hidden="true" />}
        <span className="music-label">{pending ? "Cargando música…" : playing ? "Pausar música" : "Activar música"}</span>
      </button>
      {error && <p className="music-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
