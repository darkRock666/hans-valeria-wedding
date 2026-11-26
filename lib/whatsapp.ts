/** Prepare an individual RSVP message; this does not send or open WhatsApp. */
export function weddingWhatsAppUrl(input: {
  name: string;
  attendance: "yes" | "no";
  message?: string;
}): string {
  const name = input.name.trim().replace(/\s+/g, " ");
  // Count Unicode characters so trimming a long message cannot split an emoji.
  const message = Array.from(input.message?.trim() ?? "").slice(0, 500).join("");
  const lines = [
    "Boda de Hans & Valeria",
    "Confirmación individual",
    `Nombre: ${name}`,
    input.attendance === "yes"
      ? "Asistencia: Sí, asistiré."
      : "Asistencia: No podré asistir.",
    "Fecha: 26 de diciembre de 2026",
    "Hora: 16:00 (4:00 p. m.), La Paz, Bolivia",
  ];
  if (message) lines.push(`Mensaje: ${message}`);
  return `https://wa.me/59178795551?text=${encodeURIComponent(lines.join("\n"))}`;
}
