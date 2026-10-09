// @ts-check

/**
 * One floating tooltip for the map. On touch devices it is "pinned": it stays open
 * after the tap and can contain a button (e.g. "Show details").
 * @param {HTMLElement} el
 * @param {HTMLElement} bounds  element the tooltip must stay inside
 */
export function createTooltip(el, bounds) {
  let pinned = false;

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function place(clientX, clientY) {
    const box = bounds.getBoundingClientRect();
    const tip = el.getBoundingClientRect();
    const offset = 14;
    let x = clientX - box.left + offset;
    let y = clientY - box.top + offset;
    if (x + tip.width > box.width - 8) x = clientX - box.left - tip.width - offset;
    if (y + tip.height > box.height - 8) y = clientY - box.top - tip.height - offset;
    el.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }

  return {
    get pinned() {
      return pinned;
    },
    /**
     * @param {string} html  trusted markup built from dataset values
     * @param {number} clientX
     * @param {number} clientY
     * @param {{ pin?: boolean }} [options]
     */
    show(html, clientX, clientY, { pin = false } = {}) {
      pinned = pin;
      el.innerHTML = html;
      el.hidden = false;
      el.classList.toggle("is-pinned", pin);
      place(clientX, clientY);
    },
    hide() {
      pinned = false;
      el.hidden = true;
      el.classList.remove("is-pinned");
    },
  };
}

/** @typedef {ReturnType<typeof createTooltip>} Tooltip */
