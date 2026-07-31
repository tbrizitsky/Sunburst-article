// article-parser.js
// Splits a markdown article (spec/article.md) into an ordered list of blocks:
//   { type: "prose", md: string }
//   { type: "sunburst", directive: { data, controls, scroll, view, locked, caption }, md?: string }
//   { type: "treemap", directive: { data, controls, locked, caption }, md?: string }
//   { type: "stasko", directive: { data, ringWidth, caption }, md?: string }
//
// Two parsing modes for widget tags:
//   - Inline attrs form:  <sunburst data="disk" maxRings="5">Prose content</sunburst>
//     → { type: "sunburst", directive: {data:"disk", maxRings:5}, md: "Prose content" }
//   - Key/value body form: <sunburst>\ndata: disk\nmaxRings: 5\n</sunburst>
//     → { type: "sunburst", directive: {data:"disk", maxRings:5} }
// Self-closing: <sunburst data="disk" />  → { type: "sunburst", directive: {data:"disk"} }

/**
 * Parse a value string into its typed equivalent.
 */
function parseValue(str) {
  const s = str.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (!isNaN(s) && s !== "") return Number(s);
  // Strip surrounding quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse an inline object like { min: 1, max: 11, step: 1, default: 10 }
 * or a list like [small, grow, shrink].
 */
function parseInlineValue(str) {
  const s = str.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    const inner = s.slice(1, -1).trim();
    const obj = {};
    // Split by top-level commas (not inside nested braces/brackets/quotes)
    let depth = 0, inQuote = false, start = 0;
    for (let i = 0; i <= inner.length; i++) {
      const ch = inner[i];
      if (inQuote) { if (ch === '"') inQuote = false; continue; }
      if (ch === '"') { inQuote = true; continue; }
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if ((ch === "," || i === inner.length) && depth === 0) {
        const part = inner.slice(start, i).trim();
        const colonIdx = part.indexOf(":");
        if (colonIdx !== -1) {
          const k = part.slice(0, colonIdx).trim();
          const v = part.slice(colonIdx + 1).trim();
          obj[k] = parseInlineValue(v);
        }
        start = i + 1;
      }
    }
    return obj;
  }
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(p => parseValue(p.trim()));
  }
  return parseValue(s);
}

/**
 * Parse a block of indented lines under a key with no inline value.
 * If the first non-empty indented line starts with "- ", parse as a list
 * (scroll-style). Otherwise, recursively parse as a sub-object.
 */
function parseIndentedBlock(lines, startIdx, baseIndent) {
  const blockLines = [];
  let i = startIdx;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) { i++; continue; }
    const indent = raw.length - raw.trimStart().length;
    if (indent <= baseIndent) break;
    blockLines.push(raw);
    i++;
  }
  if (blockLines.length === 0) return {};

  // Check if first content line is a list item
  const firstLine = blockLines[0].trim();
  if (firstLine.startsWith("- ")) {
    return parseIndentedList(blockLines.join("\n"));
  }

  return parseDirectiveBody(blockLines.join("\n"));
}

/**
 * Parse a body that consists entirely of list items (- key: value).
 * Returns an array of item objects (with an optional nested sub-block).
 */
function parseIndentedList(body) {
  const items = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) { i++; continue; }
    if (!trimmed.startsWith("- ")) { i++; continue; }

    const itemStr = trimmed.slice(2).trim();
    const colonIdx = itemStr.indexOf(":");
    if (colonIdx === -1) {
      // Simple list item: "- foo" → "foo" (string)
      items.push(itemStr);
      i++;
      continue;
    }

    const key = itemStr.slice(0, colonIdx).trim();
    const rest = itemStr.slice(colonIdx + 1).trim();
    const item = { name: key };
    if (rest) {
      Object.assign(item, parseInlineValue(rest));
    }
    items.push(item);
    i++;
  }
  return items;
}

/**
 * Parse a fenced code block body into a directive object.
 */
function parseDirectiveBody(body) {
  const directive = {};
  const lines = body.split("\n");

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "sunburst") { i++; continue; }

    const indent = raw.length - raw.trimStart().length;

    // Handle list items: "- key: value" or "- key: { ... }"
    if (trimmed.startsWith("- ")) {
      const itemStr = trimmed.slice(2).trim();
      const colonIdx = itemStr.indexOf(":");
      if (colonIdx !== -1) {
        const key = itemStr.slice(0, colonIdx).trim();
        const rest = itemStr.slice(colonIdx + 1).trim();
        let parentKey = null;
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (prev && !prev.startsWith("- ") && !prev.startsWith("#")) {
            const pColon = prev.indexOf(":");
            if (pColon !== -1) {
              parentKey = prev.slice(0, pColon).trim();
              break;
            }
          }
        }
        if (parentKey) {
          if (!Array.isArray(directive[parentKey])) directive[parentKey] = [];
          const item = { name: key };
          if (rest) {
            Object.assign(item, parseInlineValue(rest));
          }
          directive[parentKey].push(item);
        }
      }
      i++;
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (key === "scroll") {
      const items = [];
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l.startsWith("- ")) break;
        const itemStr = l.slice(2).trim();
        const item = {};
        let depth = 0, inQuote = false, start = 0;
        for (let j = 0; j <= itemStr.length; j++) {
          const ch = itemStr[j];
          if (inQuote) { if (ch === '"') inQuote = false; continue; }
          if (ch === '"') { inQuote = true; continue; }
          if (ch === "{" || ch === "[") depth++;
          if (ch === "}" || ch === "]") depth--;
          if ((ch === "," || j === itemStr.length) && depth === 0) {
            const part = itemStr.slice(start, j).trim();
            const eqIdx = part.indexOf(":");
            if (eqIdx !== -1) {
              const k = part.slice(0, eqIdx).trim();
              const v = part.slice(eqIdx + 1).trim();
              item[k] = parseInlineValue(v);
            }
            start = j + 1;
          }
        }
        items.push(item);
        i++;
      }
      directive.scroll = items;
      continue;
    }

    // Empty rest (no inline value) — look ahead for indented block
    if (!rest) {
      i++;
      const sub = parseIndentedBlock(lines, i, indent);
      const hasContent = Array.isArray(sub) ? sub.length > 0 : Object.keys(sub).length > 0;
      if (hasContent) {
        directive[key] = sub;
      } else {
        directive[key] = "";
      }
      // Advance i past the consumed indented lines
      while (i < lines.length) {
        const raw2 = lines[i];
        if (!raw2.trim()) { i++; continue; }
        const ind2 = raw2.length - raw2.trimStart().length;
        if (ind2 <= indent) break;
        i++;
      }
      continue;
    }

    // Simple key: value
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const quote = rest[0];
      const endIdx = rest.indexOf(quote, 1);
      if (endIdx !== -1) {
        directive[key] = rest.slice(1, endIdx);
      } else {
        directive[key] = rest;
      }
    } else if (rest.startsWith("{") || rest.startsWith("[")) {
      directive[key] = parseInlineValue(rest);
    } else if (rest.includes(",") && !rest.includes(":") && !rest.includes("{")) {
      directive[key] = rest.split(",").map(s => parseValue(s.trim()));
    } else {
      directive[key] = parseValue(rest);
    }
    i++;
  }

  return directive;
}

/**
 * Clone a directive object (shallow copy of top-level fields, deep copy of arrays/objects).
 */
function cloneDirective(directive) {
  const clone = {};
  for (const [key, value] of Object.entries(directive)) {
    if (Array.isArray(value)) {
      clone[key] = value.map(item =>
        typeof item === "object" && item !== null ? { ...item } : item
      );
    } else if (typeof value === "object" && value !== null) {
      clone[key] = { ...value };
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

/**
 * Apply an override object onto a directive.
 * - Arrays: replace entirely.
 * - Objects (plain): merge into existing object (override keys win).
 * - Primitives: replace directly.
 */
function applyOverrides(directive, override) {
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      directive[key] = value.map(item =>
        typeof item === "object" && item !== null ? { ...item } : item
      );
    } else if (value !== null && typeof value === "object") {
      const existing = directive[key];
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        directive[key] = { ...existing, ...value };
      } else {
        directive[key] = { ...value };
      }
    } else {
      directive[key] = value;
    }
  }
  return directive;
}

/**
 * Parse inline tag attributes like `src="x.png" caption="A caption"` into a directive object.
 */
function parseInlineTagAttributes(str) {
  const directive = {};
  const re = /(\w+)\s*=\s*"([^"]*)"\s*/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const val = match[2];
    if (val === "true") directive[match[1]] = true;
    else if (val === "false") directive[match[1]] = false;
    else if (!isNaN(val) && val !== "") directive[match[1]] = Number(val);
    else if (val.startsWith("{") || val.startsWith("[")) directive[match[1]] = parseInlineValue(val);
    else directive[match[1]] = val;
  }
  return directive;
}

/**
 * Parse a markdown article into blocks.
 * @param {string} md - Raw markdown text
 * @returns {Array<{type: string, md?: string, directive?: object}>}
 */
export function parseArticle(md) {
  const blocks = [];
  const lines = md.split("\n");
  let i = 0;
  let lastWidgetDirective = null;
  let lastBlockType = null;

  // Known tag names that terminate prose scanning
  const TAG_NAMES = ["sunburst", "sunburst-hue", "sunburst-playground", "sunburst-mvp", "sunburst-geometry", "treemap", "icicle", "stasko", "instructions", "image", "deactivate"];

  // Widget tags that are never clonable via <instructions> (spec/staging-article.md).
  const NON_CLONABLE = new Set(["sunburst-hue", "sunburst-mvp"]);

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Generic tag detection: <tagname> with optional attributes.
    // Match opening tag even when followed by inline content (body + closing tag on same line).
    const tagMatch = trimmed.match(/^<([\w-]+)\s*([^>]*)>/);

    if (tagMatch && TAG_NAMES.includes(tagMatch[1])) {
      const tagName = tagMatch[1];
      const attrs = tagMatch[2].trim();

      // Self-closing: <tagname key="val" />
      if (attrs.endsWith("/") || trimmed.endsWith("/>")) {
        const dir = parseInlineTagAttributes(attrs.replace(/\/$/, "").trim());
        if (tagName === "sunburst") {
          blocks.push({ type: "sunburst", directive: dir });
          lastWidgetDirective = dir; lastBlockType = "sunburst";
        } else if (tagName === "treemap") {
          blocks.push({ type: "treemap", directive: dir });
          lastWidgetDirective = dir; lastBlockType = "treemap";
        } else if (tagName === "icicle") {
          blocks.push({ type: "icicle", directive: dir });
          lastWidgetDirective = dir; lastBlockType = "icicle";
        } else if (tagName === "stasko") {
          blocks.push({ type: "stasko", directive: dir });
          lastWidgetDirective = dir; lastBlockType = "stasko";
        } else if (tagName === "sunburst-hue") {
          blocks.push({ type: "sunburst-hue", directive: dir });
        } else if (tagName === "sunburst-playground") {
          blocks.push({ type: "sunburst-playground", directive: dir });
        } else if (tagName === "sunburst-mvp") {
          blocks.push({ type: "sunburst-mvp", directive: dir });
        } else if (tagName === "sunburst-geometry") {
          blocks.push({ type: "sunburst-geometry", directive: dir });
        } else if (tagName === "image") {
          blocks.push({ type: "image", directive: dir });
        } else if (tagName === "deactivate") {
          blocks.push({ type: "deactivate", directive: {} });
        }
        i++;
        continue;
      }

      // Check if closing tag and body are on the same line (inline content)
      let body;
      const inlineContent = trimmed.slice(tagMatch[0].length).trim();

      if (inlineContent) {
        const closeIdx = inlineContent.indexOf(`</${tagName}>`);
        if (closeIdx !== -1) {
          body = inlineContent.slice(0, closeIdx);
        } else {
          body = inlineContent;
        }
        i++; // advance past this wholly-consumed line
      } else {
        // Multi-line body: collect lines until closing tag
        i++;
        const bodyLines = [];
        const closeTag = `</${tagName}>`;
        while (i < lines.length && lines[i].trim() !== closeTag) {
          bodyLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing tag
        body = bodyLines.join("\n");
      }

      const isWidget = tagName === "sunburst" || tagName === "sunburst-hue" || tagName === "sunburst-playground" || tagName === "sunburst-mvp" || tagName === "sunburst-geometry" || tagName === "treemap" || tagName === "icicle" || tagName === "stasko";
      const hasInlineAttrs = attrs.length > 0 && attrs.includes("=");
      const trimmedBody = body.trim();

      if (isWidget && hasInlineAttrs) {
        const directive = parseInlineTagAttributes(attrs);
        if (trimmedBody) {
          blocks.push({ type: tagName, directive, md: trimmedBody });
          if (!NON_CLONABLE.has(tagName)) { lastWidgetDirective = directive; lastBlockType = tagName; }
        } else {
          blocks.push({ type: tagName, directive });
          if (!NON_CLONABLE.has(tagName)) { lastWidgetDirective = directive; lastBlockType = tagName; }
        }
      } else {
        const directive = parseDirectiveBody(body);

        if (tagName === "sunburst") {
          blocks.push({ type: "sunburst", directive });
          lastWidgetDirective = directive; lastBlockType = "sunburst";
        } else if (tagName === "treemap") {
          blocks.push({ type: "treemap", directive });
          lastWidgetDirective = directive; lastBlockType = "treemap";
        } else if (tagName === "icicle") {
          blocks.push({ type: "icicle", directive });
          lastWidgetDirective = directive; lastBlockType = "icicle";
        } else if (tagName === "stasko") {
          blocks.push({ type: "stasko", directive });
          lastWidgetDirective = directive; lastBlockType = "stasko";
        } else if (tagName === "instructions") {
          if (!lastWidgetDirective) continue;
          const clone = cloneDirective(lastWidgetDirective);
          if (directive.override) {
            applyOverrides(clone, directive.override);
          }
          blocks.push({ type: lastBlockType || "sunburst", directive: clone });
          lastWidgetDirective = clone;
        } else if (tagName === "sunburst-hue") {
          blocks.push({ type: "sunburst-hue", directive });
        } else if (tagName === "sunburst-playground") {
          blocks.push({ type: "sunburst-playground", directive });
        } else if (tagName === "sunburst-mvp") {
          blocks.push({ type: "sunburst-mvp", directive });
        } else if (tagName === "sunburst-geometry") {
          blocks.push({ type: "sunburst-geometry", directive });
        } else if (tagName === "image") {
          blocks.push({ type: "image", directive });
        } else if (tagName === "deactivate") {
          blocks.push({ type: "deactivate", directive });
        }
      }
      continue;
    }

    // Check for any other fenced code block — skip it
    if (trimmed.startsWith("```")) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
      if (i < lines.length) i++;
      continue;
    }

    // Prose block: collect lines until we hit a tag or fenced block
    const proseLines = [];
    while (i < lines.length
      && !lines[i].trim().startsWith("```")
      && !TAG_NAMES.some(t => lines[i].trim() === `<${t}>` || lines[i].trim().startsWith(`<${t} `))
    ) {
      proseLines.push(lines[i]);
      i++;
    }
    const prose = proseLines.join("\n").trim();
    if (prose) {
      blocks.push({ type: "prose", md: prose });
    }
  }

  return blocks;
}
