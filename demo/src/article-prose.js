import { Marked } from "marked";

const EXTERNAL_LINK = /^(?:https?:\/\/|\/\/)/;

function escapeAttr(value) {
  return value.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function renderLink({ href, title, tokens }) {
  if (!EXTERNAL_LINK.test(href)) return false;
  const text = this.parser.parseInline(tokens);
  let url;
  try {
    url = encodeURI(href).replace(/%25/g, "%");
  } catch {
    return false;
  }
  let html = `<a href="${url}" target="_blank" rel="noopener noreferrer"`;
  if (title) html += ` title="${escapeAttr(title)}"`;
  return html + `>${text}</a>`;
}

const articleMarked = new Marked({ renderer: { link: renderLink } });

export function renderArticleProse(md) {
  return articleMarked.parse(md);
}
