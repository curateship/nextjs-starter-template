/*
 * The Daily card's confetti: a streak milestone sets it off, and so does
 * Rate day.
 */

const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"]

/** A short burst of confetti over the card, left out for anyone whose device asks for less motion. */
export function burstConfetti(card: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const layer = document.createElement("div")
  layer.setAttribute("aria-hidden", "true")
  layer.className = "pointer-events-none absolute inset-0 overflow-hidden"
  card.appendChild(layer)
  const pieces = Array.from({ length: 40 }, (_, index) => {
    const piece = document.createElement("span")
    piece.className = "absolute top-0 block size-1.5 rounded-[1px]"
    piece.style.left = `${(index * 37) % 100}%`
    piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length]
    layer.appendChild(piece)
    return piece.animate(
      [
        { transform: "translateY(-10px) rotate(0deg)", opacity: 1 },
        { transform: `translateY(${180 + ((index * 23) % 120)}px) rotate(${(index % 2 ? 1 : -1) * 540}deg)`, opacity: 0 },
      ],
      { duration: 1400 + ((index * 41) % 600), easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" }
    ).finished
  })
  void Promise.allSettled(pieces).then(() => layer.remove())
}
