'use strict';

const grid = document.getElementById('grid');
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function focusFirst() {
  const first = grid.querySelector('.item');
  if (first) first.focus({ preventScroll: true });
}

window.popAPI.onItems((items) => {
  grid.innerHTML = (items || [])
    .map((item, index) => {
      const title = item.title || item.label || `Action ${index + 1}`;
      const body = item.text
        ? `<span class="text-face" style="font-size:${Number(item.fontSize) || 15}px">${esc(item.label)}</span>`
        : `${
            item.icon
              ? `<img class="icon" src="${esc(item.icon)}" alt="" draggable="false" />`
              : item.emoji
                ? `<span class="emoji">${esc(item.emoji)}</span>`
                : ''
          }
          ${item.label ? `<span class="label">${esc(item.label)}</span>` : ''}`;
      return `<button class="item" type="button" data-index="${index}" title="${esc(
        title
      )}" aria-label="${esc(title)}">${body}</button>`;
    })
    .join('');
  grid.querySelectorAll('.item').forEach((button) => {
    button.addEventListener('click', () => window.popAPI.choose(Number(button.dataset.index)));
  });
  requestAnimationFrame(focusFirst);
});

document.getElementById('close').addEventListener('click', () => window.popAPI.choose(-1));

// The items can arrive before the window is key; put focus back on the grid
// once macOS activates it.
window.addEventListener('focus', () => {
  if (!document.activeElement?.classList.contains('item')) focusFirst();
});

document.addEventListener('keydown', (event) => {
  const buttons = [...grid.querySelectorAll('.item')];
  if (event.key === 'Escape') {
    event.preventDefault();
    window.popAPI.choose(-1);
    return;
  }
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement);
  let next = null;
  if (event.key === 'ArrowRight') next = current < 0 ? 0 : current + 1;
  else if (event.key === 'ArrowLeft') next = current < 0 ? 0 : current - 1;
  else if (event.key === 'ArrowDown') next = current < 0 ? 0 : current + 3;
  else if (event.key === 'ArrowUp') next = current < 0 ? 0 : current - 3;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else if ((event.key === 'Enter' || event.key === ' ') && current < 0) {
    event.preventDefault();
    buttons[0].click();
    return;
  }
  if (next === null) return;
  event.preventDefault();
  buttons[Math.max(0, Math.min(buttons.length - 1, next))].focus();
});
