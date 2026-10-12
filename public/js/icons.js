// Bộ icon SVG thống nhất (nét 1.75, bo tròn đầu nét).
import { raw } from './util.js';

const svg = (body, cls = 'icon') =>
  raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`);

const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.6-9 9-9 9z"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  send: '<path d="M4 12l16-8-6 16-3-6-7-2z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

export const icon = (name, cls) => svg(paths[name] || '', cls);

export const logoMark = raw('<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" fill="#111"/><path d="M7 21l7-10h4l-4 6h8l-2 4z" fill="#fff"/></svg>');
