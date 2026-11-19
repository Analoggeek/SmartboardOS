/* emoji-data.js — ~80 emoji drawn as bundled SVG vector art (data URIs).
   They render identically on every OS, work offline and export into PNG/PDF. */

const uri = (inner) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${inner}</svg>`
);

const FACE = '#ffcf4a';
const FACE_EDGE = '#e7a733';
const INK = '#3a2a10';

const eyes = (lx = 23, rx = 41, cy = 27, ry = 5) =>
  `<ellipse cx="${lx}" cy="${cy}" rx="3.1" ry="${ry}" fill="${INK}"/><ellipse cx="${rx}" cy="${cy}" rx="3.1" ry="${ry}" fill="${INK}"/>`;
const smile = (y = 40, w = 18) => `<path d="M${32 - w / 2} ${y}q${w / 2} 9 ${w} 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
const openSmile = (y = 38) => `<path d="M19 ${y}q13 17 26 0z" fill="#5a2b18"/><path d="M25 ${y + 8}q7 6 14 0" fill="#ff7d7d"/>`;
const blush = () => `<ellipse cx="15" cy="38" rx="5" ry="3" fill="#ff9aa2" opacity=".75"/><ellipse cx="49" cy="38" rx="5" ry="3" fill="#ff9aa2" opacity=".75"/>`;
const face = (extra = '', extraTop = '') =>
  `<circle cx="32" cy="32" r="27" fill="${FACE}" stroke="${FACE_EDGE}" stroke-width="2"/>${extraTop}${extra}`;

const list = [];
const add = (group, name, svg) => list.push({ group, name, src: uri(svg) });

/* ——— faces ——— */
add('faces', 'smile', face(eyes() + smile()));
add('faces', 'grin', face(eyes() + openSmile()));
add('faces', 'wink', face(`<ellipse cx="23" cy="27" rx="3.1" ry="5" fill="${INK}"/><path d="M37 27q4-4 8 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` + openSmile(38)));
add('faces', 'laugh', face(eyes(23, 41, 26, 3) + openSmile(36) + `<path d="M19 36h26" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`));
add('faces', 'bigsmile', face(eyes() + `<path d="M18 37q14 20 28 0z" fill="#5a2b18"/>` + `<path d="M24 44q8 6 16 0" fill="#ff7d7d"/>` + blush()));
add('faces', 'sad', face(eyes() + `<path d="M23 46q9-10 18 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`));
add('faces', 'cry', face(eyes() + `<path d="M23 44q9-9 18 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M20 33q-4 9 0 12q4-3 0-12z" fill="#59b7ff"/><path d="M44 33q4 9 0 12q-4-3 0-12z" fill="#59b7ff"/>`));
add('faces', 'angry', face(`<path d="M17 21l10 4M47 21l-10 4" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>` +
  eyes(23, 41, 28, 4) + `<path d="M23 47q9-8 18 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`));
add('faces', 'surprised', face(eyes(23, 41, 26, 6) + `<ellipse cx="32" cy="46" rx="6.5" ry="8" fill="#5a2b18"/>`));
add('faces', 'thinking', face(`<ellipse cx="23" cy="26" rx="3.1" ry="5" fill="${INK}"/><path d="M37 26q4-3 8 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M24 44h14" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
  `<circle cx="52" cy="14" r="4" fill="#fff" stroke="#c9a227" stroke-width="1.5"/><circle cx="58" cy="6" r="2.4" fill="#fff" stroke="#c9a227" stroke-width="1.5"/>`));
add('faces', 'cool', face(`<rect x="13" y="21" width="16" height="11" rx="4" fill="#25304a"/><rect x="35" y="21" width="16" height="11" rx="4" fill="#25304a"/>` +
  `<path d="M29 25h6" stroke="#25304a" stroke-width="3"/><path d="M13 24h-3M51 24h3" stroke="#25304a" stroke-width="3" stroke-linecap="round"/>` + smile(44)));
add('faces', 'sleepy', face(`<path d="M19 27q4 3 8 0M37 27q4 3 8 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
  `<ellipse cx="32" cy="45" rx="4.5" ry="5" fill="#5a2b18"/>`));
add('faces', 'heartEyes', face(`<path d="M23 31c-5-6-11 1 0 9 11-8 5-15 0-9z" fill="#ff4d6d"/>` +
  `<path d="M41 31c-5-6-11 1 0 9 11-8 5-15 0-9z" fill="#ff4d6d"/>` + openSmile(39)));
add('faces', 'starEyes', face(`<path d="m23 21 2.4 5.2 5.6.7-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.6-.7z" fill="#ffb800"/>` +
  `<path d="m41 21 2.4 5.2 5.6.7-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.6-.7z" fill="#ffb800"/>` + openSmile(39)));
add('faces', 'confused', face(`<ellipse cx="23" cy="27" rx="3.1" ry="5" fill="${INK}"/><circle cx="41" cy="27" r="3.4" fill="${INK}"/>` +
  `<path d="M22 44q6 4 10 0t10 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`));
add('faces', 'blush', face(eyes() + smile(42, 12) + blush()));
add('faces', 'silly', face(eyes(23, 41, 25, 5) +
  `<path d="M26 38q6-6 12 0v6q-6 5-12 0z" fill="#ff7d7d"/><path d="M32 38v6" stroke="#e05252" stroke-width="2"/>` + `<path d="M22 46h20" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`));
add('faces', 'angel', face(eyes() + smile(42, 14) + `<path d="M32 3l6 6h-12z" fill="#ffe27a" stroke="#e0b33a" stroke-width="1.6"/><circle cx="32" cy="4" r="3" fill="#ffe27a" stroke="#e0b33a"/>`));
add('faces', 'devil', face(`<path d="M8 9l9 8M56 9l-9 8" stroke="#a0263a" stroke-width="4" stroke-linecap="round"/>` + eyes() +
  `<path d="M22 42q10 9 20 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M26 47l3 6 3-4 3 4 3-6" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`));
add('faces', 'nerd', face(`<circle cx="23" cy="27" r="7" fill="#dff3ff" stroke="${INK}" stroke-width="2.4"/><circle cx="41" cy="27" r="7" fill="#dff3ff" stroke="${INK}" stroke-width="2.4"/>` +
  `<path d="M30 27h4" stroke="${INK}" stroke-width="2.4"/><circle cx="23" cy="27" r="2.6" fill="${INK}"/><circle cx="41" cy="27" r="2.6" fill="${INK}"/>` + smile(43, 12)));
add('faces', 'robot', `<rect x="10" y="14" width="44" height="36" rx="10" fill="#9fb4cc" stroke="#5e7791" stroke-width="2"/>` +
  `<rect x="18" y="24" width="12" height="9" rx="3" fill="#20303f"/><rect x="34" y="24" width="12" height="9" rx="3" fill="#20303f"/>` +
  `<path d="M24 41h16" stroke="#20303f" stroke-width="3" stroke-linecap="round"/><path d="M32 14V6" stroke="#5e7791" stroke-width="3"/><circle cx="32" cy="5" r="3.4" fill="#ff6f9c"/>` +
  `<rect x="20" y="34" width="24" height="12" rx="3" fill="#c3d4e6"/>`);
add('faces', 'ghost', `<path d="M32 5c-11 0-18 8-18 18v30l6-5 6 5 6-5 6 5 6-5 6 5V23c0-10-7-18-18-18z" fill="#eef2ff" stroke="#b8c2e0" stroke-width="2"/>` +
  `<ellipse cx="25" cy="26" rx="3" ry="4.4" fill="#4a557a"/><ellipse cx="39" cy="26" rx="3" ry="4.4" fill="#4a557a"/><ellipse cx="32" cy="38" rx="5" ry="6" fill="#4a557a"/>`);
add('faces', 'party', `<path d="M32 4l7 12H25z" fill="#ff6f9c"/><circle cx="32" cy="32" r="27" fill="${FACE}" stroke="${FACE_EDGE}" stroke-width="2"/>` +
  eyes(23, 41, 26, 5) + openSmile(38) +
  `<circle cx="9" cy="22" r="3" fill="#5ad1ff"/><circle cx="55" cy="20" r="3" fill="#4ade80"/><circle cx="12" cy="48" r="2.6" fill="#ff6f9c"/><circle cx="53" cy="46" r="2.6" fill="#fbbf24"/>`);

/* ——— school ——— */
add('school', 'book', `<path d="M8 10c8-4 16-2 24 2v36c-8-4-16-6-24-2z" fill="#6aa9ff" stroke="#2f66c4" stroke-width="2"/>` +
  `<path d="M56 10c-8-4-16-2-24 2v36c8-4 16-6 24-2z" fill="#8bc0ff" stroke="#2f66c4" stroke-width="2"/>` +
  `<path d="M32 12v36" stroke="#2f66c4" stroke-width="2.5"/>`);
add('school', 'notebook', `<rect x="12" y="6" width="40" height="52" rx="5" fill="#ffd76e" stroke="#d9a72f" stroke-width="2"/>` +
  `<path d="M22 6v52" stroke="#d9a72f" stroke-width="2.5"/><path d="M28 20h18M28 30h18M28 40h12" stroke="#a9812a" stroke-width="2.4" stroke-linecap="round"/>`);
add('school', 'pencil', `<path d="M14 50l4-12L44 12l8 8-26 26z" fill="#ffd76e" stroke="#c99a2c" stroke-width="2"/>` +
  `<path d="M44 12l8 8 4-4-8-8z" fill="#ff8fa3"/><path d="M18 38l8 8-6 6-8-8z" fill="#f4c9a8"/><path d="M12 52l2-8 6 6z" fill="#3a2a10"/>`);
add('school', 'pen', `<rect x="14" y="18" width="10" height="34" rx="3" fill="#5a8fe8" stroke="#2f5fb0" stroke-width="2" transform="rotate(18 19 35)"/>` +
  `<path d="M18 12l8 3-2 8-8-3z" fill="#c8d6ef" stroke="#2f5fb0" stroke-width="1.6"/>`);
add('school', 'ruler', `<rect x="6" y="22" width="52" height="20" rx="3" fill="#ffd76e" stroke="#c99a2c" stroke-width="2" transform="rotate(-12 32 32)"/>` +
  `<path d="M16 24v8M24 24v6M32 24v8M40 24v6M48 24v8" stroke="#a9812a" stroke-width="2"/>`);
add('school', 'scissors', `<circle cx="16" cy="46" r="7" fill="none" stroke="#8a93ad" stroke-width="3.4"/><circle cx="16" cy="18" r="7" fill="none" stroke="#8a93ad" stroke-width="3.4"/>` +
  `<path d="M21 22l28 24M21 42L49 18" stroke="#c7d0e4" stroke-width="4" stroke-linecap="round"/>`);
add('school', 'backpack', `<rect x="14" y="18" width="36" height="38" rx="9" fill="#6f8cff" stroke="#3c56bf" stroke-width="2"/>` +
  `<path d="M22 18v-4a10 10 0 0 1 20 0v4" fill="none" stroke="#3c56bf" stroke-width="3"/><rect x="22" y="34" width="20" height="14" rx="4" fill="#a9bcff"/>`);
add('school', 'apple', `<path d="M32 16c-6-8-20-6-20 10 0 14 12 28 20 28s20-14 20-28c0-16-14-18-20-10z" fill="#ff4d5e" stroke="#c22b3c" stroke-width="2"/>` +
  `<path d="M32 16c0-6 3-10 8-12 1 6-2 10-8 12z" fill="#3fbf60"/><path d="M32 14v-6" stroke="#7a4a22" stroke-width="3" stroke-linecap="round"/>`);
add('school', 'bulb', `<circle cx="32" cy="26" r="15" fill="#ffe27a" stroke="#dcae2b" stroke-width="2"/><rect x="25" y="40" width="14" height="10" rx="3" fill="#c9d3e6"/><path d="M27 50h10" stroke="#8b96ad" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M32 18v10l5 4" stroke="#dcae2b" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
add('school', 'trophy', `<path d="M20 10h24v12a12 12 0 0 1-24 0z" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/>` +
  `<path d="M20 13h-7v5a8 8 0 0 0 8 8M44 13h7v5a8 8 0 0 1-8 8" fill="none" stroke="#d8a01f" stroke-width="2.6"/>` +
  `<path d="M32 34v10M22 52h20l-3-8H25z" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/>`);
add('school', 'medal', `<circle cx="32" cy="40" r="14" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/><path d="M24 6l8 16M40 6l-8 16" stroke="#e0556d" stroke-width="7" stroke-linecap="round"/>` +
  `<path d="m32 31 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2-4.5-4.4 6.2-.9z" fill="#a9812a"/>`);
add('school', 'target', `<circle cx="32" cy="32" r="26" fill="#ff6f7d"/><circle cx="32" cy="32" r="19" fill="#fff"/><circle cx="32" cy="32" r="12" fill="#ff6f7d"/><circle cx="32" cy="32" r="5" fill="#fff"/>`);
add('school', 'rocket', `<path d="M32 5c9 6 13 17 13 27l-13 8-13-8c0-10 4-21 13-27z" fill="#eef3ff" stroke="#a9b6d4" stroke-width="2"/>` +
  `<circle cx="32" cy="24" r="5.5" fill="#5ad1ff" stroke="#2b9bc4" stroke-width="2"/><path d="M19 32l-10 9 10 3zM45 32l10 9-10 3z" fill="#ff6f7d"/>` +
  `<path d="M32 40v14" stroke="#ffb545" stroke-width="7" stroke-linecap="round"/>`);
['A', 'B', 'C'].forEach((letter, i) => add('school', 'letter-' + letter,
  `<rect x="6" y="6" width="52" height="52" rx="14" fill="${['#ff8fa3', '#7fd6a1', '#8bb8ff'][i]}"/>` +
  `<text x="32" y="45" font-family="Verdana,Arial,sans-serif" font-size="34" font-weight="bold" fill="#20304a" text-anchor="middle">${letter}</text>`));
['1', '2', '3'].forEach((n, i) => add('school', 'number-' + n,
  `<rect x="6" y="6" width="52" height="52" rx="14" fill="${['#ffd76e', '#9fe0ff', '#c8a7ff'][i]}"/>` +
  `<text x="32" y="46" font-family="Verdana,Arial,sans-serif" font-size="36" font-weight="bold" fill="#20304a" text-anchor="middle">${n}</text>`));
add('school', 'plus', `<rect x="6" y="6" width="52" height="52" rx="14" fill="#7fd6a1"/><path d="M32 18v28M18 32h28" stroke="#20533a" stroke-width="6" stroke-linecap="round"/>`);
add('school', 'check', `<rect x="6" y="6" width="52" height="52" rx="14" fill="#4ade80"/><path d="M17 33l10 10 20-21" fill="none" stroke="#14532d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
add('school', 'cross', `<rect x="6" y="6" width="52" height="52" rx="14" fill="#ff6f7d"/><path d="M20 20l24 24M44 20 20 44" stroke="#6b1220" stroke-width="6" stroke-linecap="round"/>`);
add('school', 'question', `<circle cx="32" cy="32" r="27" fill="#9fc4ff"/><text x="32" y="45" font-family="Verdana,Arial,sans-serif" font-size="38" font-weight="bold" fill="#20304a" text-anchor="middle">?</text>`);
add('school', 'exclamation', `<circle cx="32" cy="32" r="27" fill="#ffb545"/><text x="32" y="45" font-family="Verdana,Arial,sans-serif" font-size="38" font-weight="bold" fill="#5a3208" text-anchor="middle">!</text>`);

/* ——— nature ——— */
add('nature', 'sun', `<circle cx="32" cy="32" r="14" fill="#ffcf4a" stroke="#e7a733" stroke-width="2"/>` +
  `<g stroke="#ffb545" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M51 13l-6 6M19 45l-6 6"/></g>`);
add('nature', 'cloud', `<path d="M18 44a10 10 0 0 1 0-20 14 14 0 0 1 26-4 9 9 0 0 1 3 17z" fill="#eef4ff" stroke="#a9bbd8" stroke-width="2"/>`);
add('nature', 'rain', `<path d="M17 38a10 10 0 0 1 0-19 14 14 0 0 1 26-4 9 9 0 0 1 3 16z" fill="#dbe7ff" stroke="#8fa6cf" stroke-width="2"/>` +
  `<g stroke="#5aa9ff" stroke-width="3.4" stroke-linecap="round"><path d="M22 44l-3 9M32 44l-3 9M42 44l-3 9"/></g>`);
add('nature', 'rainbow', `<g fill="none" stroke-width="6" stroke-linecap="round"><path d="M8 44a24 24 0 0 1 48 0" stroke="#ff6f7d"/><path d="M15 44a17 17 0 0 1 34 0" stroke="#ffb545"/><path d="M22 44a10 10 0 0 1 20 0" stroke="#4ade80"/></g>` +
  `<circle cx="9" cy="46" r="5" fill="#eef4ff" stroke="#c0cde3" stroke-width="1.6"/><circle cx="55" cy="46" r="5" fill="#eef4ff" stroke="#c0cde3" stroke-width="1.6"/>`);
add('nature', 'moon', `<path d="M42 6a26 26 0 1 0 16 40A22 22 0 0 1 42 6z" fill="#ffe27a" stroke="#dcae2b" stroke-width="2"/>`);
add('nature', 'star', `<path d="m32 4 8.5 17.6 19 2.7-13.8 13.5 3.3 19-17-9-17 9 3.3-19L4.5 24.3l19-2.7z" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/>`);
add('nature', 'sparkles', `<path d="m26 6 4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="#ffd25e"/>` +
  `<path d="m46 30 2.6 6.4 6.4 2.6-6.4 2.6L46 48l-2.6-6.4L37 39l6.4-2.6z" fill="#ffb545"/>` +
  `<path d="m14 38 2 4.6 4.6 2-4.6 2L14 51l-2-4.4-4.6-2 4.6-2z" fill="#ffe9a8"/>`);
add('nature', 'tree', `<rect x="28" y="38" width="8" height="20" rx="3" fill="#8a5a2b"/><circle cx="32" cy="26" r="18" fill="#4ade80"/><circle cx="20" cy="32" r="11" fill="#37c46a"/><circle cx="44" cy="32" r="11" fill="#37c46a"/>`);
add('nature', 'flower', `<circle cx="32" cy="32" r="7" fill="#ffd25e"/><g fill="#ff8fa3">` +
  `<circle cx="32" cy="16" r="9"/><circle cx="47" cy="27" r="9"/><circle cx="42" cy="45" r="9"/><circle cx="22" cy="45" r="9"/><circle cx="17" cy="27" r="9"/></g>`);
add('nature', 'leaf', `<path d="M52 12C30 10 14 22 14 40c0 6 4 10 10 10 18 0 30-16 28-38z" fill="#4ade80" stroke="#2f9e5c" stroke-width="2"/><path d="M20 46C30 36 40 26 50 16" stroke="#2f9e5c" stroke-width="2.4" fill="none"/>`);
add('nature', 'snowflake', `<g stroke="#7fd0ff" stroke-width="3.4" stroke-linecap="round"><path d="M32 6v52M9 19l46 26M55 19 9 45"/>` +
  `<path d="M26 12l6 6 6-6M26 52l6-6 6 6M14 24l8 1 1-8M50 40l-8-1-1 8M50 24l-8 1 1-8M14 40l8-1 1 8"/></g>`);
add('nature', 'fire', `<path d="M32 4c8 12 18 18 18 30a18 18 0 0 1-36 0c0-8 5-12 9-18 2 6 5 8 9 10-2-8 0-16 0-22z" fill="#ff8a3d" stroke="#e05e18" stroke-width="2"/>` +
  `<path d="M32 30c4 5 7 8 7 13a7 7 0 0 1-14 0c0-4 3-6 7-13z" fill="#ffe27a"/>`);
add('nature', 'drop', `<path d="M32 5c9 12 16 20 16 29a16 16 0 0 1-32 0c0-9 7-17 16-29z" fill="#5ad1ff" stroke="#2b9bc4" stroke-width="2"/>` +
  `<ellipse cx="25" cy="34" rx="3.4" ry="6" fill="#c9f2ff" opacity=".85"/>`);
add('nature', 'butterfly', `<path d="M32 20C26 8 6 8 8 24c1 10 12 14 18 16z" fill="#c8a7ff" stroke="#8a5fd6" stroke-width="2"/>` +
  `<path d="M32 20c6-12 26-12 24 4-1 10-12 14-18 16z" fill="#9fc4ff" stroke="#5f8ad6" stroke-width="2"/>` +
  `<path d="M32 22c-4 10-4 26 0 34 4-8 4-24 0-34z" fill="#4a3a2a"/><path d="M30 12l-4-6M34 12l4-6" stroke="#4a3a2a" stroke-width="2" stroke-linecap="round"/>`);

/* ——— fun & food ——— */
add('fun', 'heart', `<path d="M32 54C18 42 6 34 6 22A13 13 0 0 1 32 15 13 13 0 0 1 58 22c0 12-12 20-26 32z" fill="#ff4d6d" stroke="#c22b45" stroke-width="2"/>`);
add('fun', 'thumbsUp', `<path d="M14 28h10v26H14z" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/>` +
  `<path d="M24 52V30c0-2 2-4 3-6 2-4 3-9 3-13a4 4 0 0 1 8 0c0 6-2 11-2 15h11a7 7 0 0 1 7 8l-3 14a6 6 0 0 1-6 4z" fill="#ffcf4a" stroke="#d8a01f" stroke-width="2"/>`);
add('fun', 'clap', `<path d="M20 24c-4-6 2-12 8-8l6 5-3 6z" fill="#ffcf4a" stroke="#d8a01f" stroke-width="2"/>` +
  `<path d="M44 24c4-6-2-12-8-8l-6 5 3 6z" fill="#ffcf4a" stroke="#d8a01f" stroke-width="2"/>` +
  `<path d="M22 30h20v14a10 10 0 0 1-20 0z" fill="#ffb545" stroke="#d8a01f" stroke-width="2"/>`);
add('fun', 'pizza', `<path d="M32 6 56 52 8 52z" fill="#ffcf4a" stroke="#d8a01f" stroke-width="2"/>` +
  `<path d="M32 16 46 44H18z" fill="#ff8a3d"/><circle cx="32" cy="34" r="3.4" fill="#c22b3c"/><circle cx="26" cy="44" r="3" fill="#c22b3c"/><circle cx="38" cy="44" r="3" fill="#c22b3c"/>`);
add('fun', 'cake', `<path d="M10 30h44v22H10z" fill="#ffb3c7"/><path d="M10 30c0-6 44-6 44 0z" fill="#fff1f6"/>` +
  `<path d="M10 38c6 5 12 0 18 4s12 0 18 0 6 0 8 0" fill="none" stroke="#ff6f9c" stroke-width="3"/>` +
  `<path d="M22 30V16M32 30V12M42 30V16" stroke="#7fd6ff" stroke-width="4" stroke-linecap="round"/><circle cx="22" cy="13" r="3.4" fill="#ffb545"/><circle cx="32" cy="9" r="3.4" fill="#ffb545"/><circle cx="42" cy="13" r="3.4" fill="#ffb545"/>`);
add('fun', 'cookie', `<circle cx="32" cy="32" r="26" fill="#d8a15a" stroke="#a8762f" stroke-width="2"/>` +
  `<circle cx="24" cy="24" r="4" fill="#5a3a18"/><circle cx="42" cy="28" r="3.4" fill="#5a3a18"/><circle cx="30" cy="42" r="3.8" fill="#5a3a18"/><circle cx="42" cy="44" r="3" fill="#5a3a18"/>`);
add('fun', 'iceCream', `<path d="M18 26h28l-14 30z" fill="#ffd7a8" stroke="#c99a6a" stroke-width="2"/><circle cx="26" cy="22" r="11" fill="#ffb3c7"/><circle cx="38" cy="22" r="11" fill="#9fe0ff"/>`);
add('fun', 'coffee', `<path d="M10 20h34v20a12 12 0 0 1-12 12H22a12 12 0 0 1-12-12z" fill="#eef2ff" stroke="#9aa8c6" stroke-width="2"/>` +
  `<path d="M44 24h6a8 8 0 0 1 0 16h-6" fill="none" stroke="#9aa8c6" stroke-width="3"/><path d="M20 12c2-4 0-6 2-8M30 12c2-4 0-6 2-8" stroke="#c0cde3" stroke-width="2.4" stroke-linecap="round"/>`);
add('fun', 'ball', `<circle cx="32" cy="32" r="26" fill="#eef2ff" stroke="#a9b6d4" stroke-width="2"/>` +
  `<path d="m32 12 9 7-3 11h-12l-3-11z" fill="#ff6f7d"/><path d="M8 30l10 3M56 30l-10 3M32 58l-4-12M32 58l4-12" stroke="#5a6478" stroke-width="2.6"/>`);
add('fun', 'guitar', `<circle cx="20" cy="44" r="13" fill="#d9954a" stroke="#a8762f" stroke-width="2"/><circle cx="20" cy="44" r="5" fill="#5a3a18"/>` +
  `<path d="M28 36 52 12l6 6-24 24z" fill="#b8793a"/><path d="M48 8l8 8" stroke="#5a3a18" stroke-width="3"/>`);
add('fun', 'music', `<path d="M26 46V16l24-6v30" fill="none" stroke="#9fc4ff" stroke-width="4" transform="translate(0,0)"/>` +
  `<ellipse cx="20" cy="47" rx="8" ry="6.5" fill="#5a8fe8" transform="rotate(-14 20 47)"/><ellipse cx="44" cy="41" rx="8" ry="6.5" fill="#5a8fe8" transform="rotate(-14 44 41)"/>` +
  `<path d="M26 20v22M50 14v22" stroke="#6b7a99" stroke-width="2.4"/>`);
add('fun', 'microscope', `<path d="M24 10h10v18H24z" fill="#9fc4ff" stroke="#5f8ad6" stroke-width="2" transform="rotate(18 29 19)"/>` +
  `<path d="M28 30a16 16 0 0 0 16 20" fill="none" stroke="#a9b6d4" stroke-width="4"/><path d="M10 54h44" stroke="#a9b6d4" stroke-width="4" stroke-linecap="round"/>` +
  `<circle cx="44" cy="44" r="5" fill="#7fd6ff"/>`);
add('fun', 'flask', `<path d="M26 6h12v16l12 27a6 6 0 0 1-5 9H19a6 6 0 0 1-5-9l12-27z" fill="#cfe4ff" stroke="#6f97c9" stroke-width="2"/>` +
  `<path d="M18 38h28l5 11a6 6 0 0 1-5 9H18a6 6 0 0 1-5-9z" fill="#4ade80" opacity=".9"/>` +
  `<path d="M26 6h12" stroke="#6f97c9" stroke-width="3"/>`);
add('fun', 'globe', `<circle cx="32" cy="32" r="26" fill="#5ad1ff" stroke="#2b9bc4" stroke-width="2"/>` +
  `<path d="M18 20c6 2 8 10 4 14s0 12 6 12 6-8 12-8 4-8-4-8-8-10-2-12" fill="none" stroke="#2f9e5c" stroke-width="4"/>` +
  `<ellipse cx="32" cy="32" rx="26" ry="11" fill="none" stroke="#2b9bc4" stroke-width="1.6"/>`);
add('fun', 'computer', `<rect x="6" y="10" width="52" height="32" rx="4" fill="#2b3550" stroke="#1a2136" stroke-width="2"/><rect x="11" y="15" width="42" height="22" rx="2" fill="#5ad1ff"/>` +
  `<path d="M22 42h20l4 10H18z" fill="#98a6c2"/>`);
add('fun', 'phone', `<rect x="18" y="4" width="28" height="56" rx="7" fill="#dbe4f7" stroke="#8fa3c9" stroke-width="2"/>` +
  `<rect x="22" y="10" width="20" height="38" rx="3" fill="#5ad1ff"/><circle cx="32" cy="54" r="3.4" fill="#8fa3c9"/>`);
add('fun', 'camera', `<rect x="6" y="16" width="52" height="34" rx="6" fill="#e9eefc" stroke="#93a3c4" stroke-width="2"/>` +
  `<path d="M22 16l4-6h12l4 6z" fill="#c0cde3" stroke="#93a3c4" stroke-width="2"/><circle cx="32" cy="33" r="11" fill="#5ad1ff" stroke="#2b9bc4" stroke-width="2"/><circle cx="32" cy="33" r="5.5" fill="#20304a"/>`);
add('fun', 'magnifier', `<circle cx="27" cy="27" r="17" fill="#dff3ff" stroke="#6f8fb5" stroke-width="5"/><path d="M40 40L56 56" stroke="#6f8fb5" stroke-width="7" stroke-linecap="round"/>`);
add('fun', 'clock', `<circle cx="32" cy="32" r="26" fill="#eef4ff" stroke="#8fa3c9" stroke-width="3"/><path d="M32 16v18l12 7" fill="none" stroke="#3b4a68" stroke-width="4" stroke-linecap="round"/>`);
add('fun', 'gift', `<rect x="8" y="24" width="48" height="32" rx="4" fill="#ff6f9c"/><rect x="8" y="24" width="48" height="10" rx="3" fill="#ffb3c7"/>` +
  `<path d="M32 24v32" stroke="#ffe27a" stroke-width="6"/><path d="M32 24c-6-12-18-12-18-2s12 4 18 2zM32 24c6-12 18-12 18-2s-12 4-18 2z" fill="#ffe27a" stroke="#d8a01f" stroke-width="1.6"/>`);
add('fun', 'balloon', `<ellipse cx="32" cy="24" rx="17" ry="21" fill="#ff6f7d"/><path d="M32 45l-3 5h6z" fill="#c22b45"/><path d="M32 50c8 6-8 8 0 12" fill="none" stroke="#8a93ad" stroke-width="2"/>`);
add('fun', 'crown', `<path d="M7 46 12 16l12 12 8-16 8 16 12-12 5 30z" fill="#ffd25e" stroke="#d8a01f" stroke-width="2"/><circle cx="32" cy="26" r="3.4" fill="#ff6f7d"/>`);
add('fun', 'key', `<circle cx="18" cy="40" r="12" fill="none" stroke="#ffd25e" stroke-width="7"/>` +
  `<path d="M27 31 54 4M42 16l7 7M48 10l6 6" stroke="#ffd25e" stroke-width="7" stroke-linecap="round"/>`);
add('fun', 'magnet', `<path d="M12 12v22a20 20 0 0 0 40 0V12H38v22a6 6 0 0 1-12 0V12z" fill="#ff6f7d" stroke="#c22b45" stroke-width="2"/>` +
  `<rect x="12" y="8" width="14" height="10" fill="#dbe4f7" stroke="#93a3c4" stroke-width="2"/><rect x="38" y="8" width="14" height="10" fill="#dbe4f7" stroke="#93a3c4" stroke-width="2"/>`);

export const emojis = list;
export const emojiGroups = [
  { id: 'faces', label: 'Faces' },
  { id: 'school', label: 'School' },
  { id: 'nature', label: 'Nature' },
  { id: 'fun', label: 'Fun' },
];
export const emojiById = new Map(list.map((e) => [e.name, e]));
export const groupEmojis = (group) => list.filter((e) => e.group === group);
export const byIndex = (i) => list[Math.abs(i) % list.length];
