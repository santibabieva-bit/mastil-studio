/**
 * Repetición espaciada (cajas de Leitner) para el Theory Trainer.
 * Cada «tarjeta» es una clave de estadística (p. ej. «fretNote:3»).
 */

export const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32];
const DAY = 86400000;

/** Devuelve la tarjeta actualizada tras una respuesta. */
export function reviewCard(card, correct, now = Date.now()) {
  const box = card?.box ?? 0;
  const nextBox = correct ? Math.min(INTERVAL_DAYS.length - 1, box + 1) : 0;
  return {
    box: nextBox,
    seen: (card?.seen ?? 0) + 1,
    due: now + INTERVAL_DAYS[nextBox] * DAY,
    last: now,
  };
}

export function isDue(card, now = Date.now()) {
  return !card || card.due <= now;
}

/**
 * Prioridad de una tarjeta: las nuevas pesan 0,6; las vencidas ≥ 1 y suben
 * con el retraso (más cuanto más baja la caja); las no vencidas, muy poco.
 */
export function dueWeight(card, now = Date.now()) {
  if (!card) return 0.6;
  if (card.due > now) return 0.08;
  const overdueDays = (now - card.due) / DAY;
  return 1 + Math.min(2, overdueDays * 0.25) + (INTERVAL_DAYS.length - 1 - card.box) * 0.08;
}

export function dueCount(srs, now = Date.now()) {
  return Object.values(srs ?? {}).filter((c) => c.due <= now).length;
}
