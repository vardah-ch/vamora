// Pointer-driven micro-interactions, wired once for the whole app.
//  .spot  – sets --mx/--my so a soft light follows the cursor
//  .tilt  – sets --rx/--ry so the card leans gently toward the cursor
// Disabled when the user prefers reduced motion; does nothing on touch.
const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const MAX_TILT = 5; // degrees

if (!reduce) {
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const spot = e.target.closest?.('.spot');
    if (spot) {
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', `${e.clientX - r.left}px`);
      spot.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    const tilt = e.target.closest?.('.tilt');
    if (tilt) {
      const r = tilt.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.setProperty('--ry', `${(px * MAX_TILT).toFixed(2)}deg`);
      tilt.style.setProperty('--rx', `${(-py * MAX_TILT).toFixed(2)}deg`);
    }
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    const tilt = e.target.closest?.('.tilt');
    if (tilt && !tilt.contains(e.relatedTarget)) {
      tilt.style.setProperty('--rx', '0deg');
      tilt.style.setProperty('--ry', '0deg');
    }
  }, { passive: true });
}
