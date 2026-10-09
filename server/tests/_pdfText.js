const zlib = require('node:zlib');

function inflate(raw, objectNumber) {
  const start = raw.search(new RegExp(`(^|\\n)${objectNumber} 0 obj\\b`));
  if (start === -1) return '';
  const body = raw.slice(start, raw.indexOf('endobj', start));
  const stream = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  if (!stream) return '';
  const bytes = Buffer.from(stream[1], 'latin1');
  try {
    return zlib.inflateSync(bytes).toString('latin1');
  } catch {
    return bytes.toString('latin1');
  }
}

function utf16(hex) {
  const clean = hex.replace(/\s+/g, '');
  const units = [];
  for (let i = 0; i + 4 <= clean.length; i += 4) units.push(parseInt(clean.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}

// Glyph id -> text, from a font's ToUnicode CMap (the bfrange arrays PDFKit writes, plus plain bfchar entries).
function parseCmap(cmap) {
  const map = new Map();
  for (const [, from, to, list] of cmap.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g)) {
    const values = [...list.matchAll(/<([0-9a-fA-F\s]*)>/g)].map((m) => utf16(m[1]));
    for (let code = parseInt(from, 16), i = 0; code <= parseInt(to, 16); code += 1, i += 1) map.set(code, values[i] || '');
  }
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code, value] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g)) map.set(parseInt(code, 16), utf16(value));
  }
  return map;
}

const CONTENT_OPS = /\/(F\d+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ/g;

function scan(buffer) {
  const raw = buffer.toString('latin1');
  const fonts = new Map();
  for (const [, name, objectNumber] of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    if (fonts.has(name)) continue;
    const start = raw.search(new RegExp(`(^|\\n)${objectNumber} 0 obj\\b`));
    const dict = start === -1 ? '' : raw.slice(start, raw.indexOf('endobj', start));
    const toUnicode = dict.match(/\/ToUnicode (\d+) 0 R/);
    fonts.set(name, toUnicode ? parseCmap(inflate(raw, toUnicode[1])) : null);
  }

  const lines = [];
  let missing = 0;
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try {
      content = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    let cmap = null;
    for (const [, font, glyphs] of content.matchAll(CONTENT_OPS)) {
      if (font) {
        cmap = fonts.get(font) || null;
      } else {
        const parts = [...glyphs.matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => {
          if (!cmap) return Buffer.from(hex, 'hex').toString('latin1');
          let text = '';
          for (let i = 0; i + 4 <= hex.length; i += 4) {
            const code = parseInt(hex.slice(i, i + 4), 16);
            if (code === 0) missing += 1;
            text += cmap.get(code) ?? '';
          }
          return text;
        });
        if (parts.length) lines.push(parts.join(''));
      }
    }
  }
  return { text: lines.join('\n'), missing };
}

// Pulls the visible text out of a PDFKit buffer so tests can assert on what the customer or seller
// would actually read. Embedded fonts are decoded through their ToUnicode maps (two bytes per glyph);
// any font without one, such as the built-in Helvetica, falls back to single-byte text.
function pdfText(buffer) {
  return scan(buffer).text;
}

// Glyphs drawn as the font's empty box (.notdef) because the font has no glyph for a character.
function pdfMissingGlyphs(buffer) {
  return scan(buffer).missing;
}

function pdfPageCount(buffer) {
  return (buffer.toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;
}

// Names of the fonts embedded in the PDF, without the subset tag (e.g. "NotoSans-Bold").
function pdfFonts(buffer) {
  const names = [...buffer.toString('latin1').matchAll(/\/BaseFont \/(?:[A-Z]{6}\+)?([\w-]+)/g)].map((m) => m[1]);
  return [...new Set(names)].sort();
}

module.exports = { pdfText, pdfPageCount, pdfFonts, pdfMissingGlyphs };
