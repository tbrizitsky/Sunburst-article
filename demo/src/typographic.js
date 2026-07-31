const CODE_MARKER = '\x00CODE';

function codeSpanMarker(i) {
  return CODE_MARKER + i + '\x00';
}

const codeSpanRE = new RegExp(CODE_MARKER + '(\\d+)\\x00', 'g');

function extractCodeSpans(text) {
  const spans = [];
  const result = text.replace(/`([^`]+)`/g, (_, content) => {
    const idx = spans.length;
    spans.push(content);
    return codeSpanMarker(idx);
  });
  return { result, spans };
}

function restoreCodeSpans(text, spans) {
  return text.replace(codeSpanRE, (_, idx) => '`' + spans[parseInt(idx)] + '`');
}

export function typographicProse(text) {
  const { result: s, spans } = extractCodeSpans(text);

  // Em dash (before en dash to avoid partial match on --- → — + remaining -)
  let r = s.replace(/---/g, '\u2014');

  // En dash between numbers (budget ranges)
  r = r.replace(/(\d+)--(\d+)/g, '$1\u2013$2');

  // Ellipsis
  r = r.replace(/\.\.\./g, '\u2026');

  // Smart double quotes — paired, non-nested
  r = r.replace(/"([^"]*)"/g, '\u201c$1\u201d');

  // Apostrophe between word characters
  r = r.replace(/(\w)'(\w)/g, '$1\u2019$2');

  // Opening single quote: after whitespace/bracket/start, before a word
  r = r.replace(/(^|\s)'(\w)/g, '$1\u2018$2');

  // Closing single quote: after a word, before whitespace/punctuation/end
  r = r.replace(/(\w)'($|\s|[.,!?;:\-])/g, '$1\u2019$2');

  // Non-breaking space between number and following word
  r = r.replace(/(\d+(?:\.\d+)?)\s+(\w+)/g, '$1\u00A0$2');

  return restoreCodeSpans(r, spans);
}
