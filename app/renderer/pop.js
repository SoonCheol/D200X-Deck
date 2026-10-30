'use strict';

const grid = document.getElementById('grid');
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

window.popAPI.onItems((items) => {
  grid.innerHTML = (items || [])
    .map(
      (item, index) => `<button class="item" data-index="${index}" title="${esc(item.label || '')}">
        ${item.emoji ? `<span class="emoji">${esc(item.emoji)}</span>` : ''}
        ${item.label ? `<span class="label">${esc(item.label)}</span>` : ''}
      </button>`
    )
    .join('');
  grid.querySelectorAll('.item').forEach((button) => {
    button.addEventListener('click', () => window.popAPI.choose(Number(button.dataset.index)));
  });
});

document.getElementById('close').addEventListener('click', () => window.popAPI.choose(-1));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.popAPI.choose(-1);
});
