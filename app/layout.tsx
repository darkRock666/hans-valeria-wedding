import type { Metadata } from "next";
import "./globals.css";
import "./dress-code.css";

export const metadata: Metadata = {
  title: "Hans & Valeria | 26 de diciembre de 2026",
  description: "Nos casamos. Acompáñanos el sábado 26 de diciembre de 2026, a las 4:00 p. m. en La Paz. Confirma tu asistencia y encuentra cómo llegar.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "Hans & Valeria · Nuestra boda", description: "26 de diciembre de 2026 · 4:00 p. m. · La Paz, Bolivia. Un día para compartir contigo.", locale: "es_BO", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><head><link rel="stylesheet" href="/fonts/fonts.css" /></head><body>{children}</body></html>;
}
