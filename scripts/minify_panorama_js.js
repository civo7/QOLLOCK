#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function fail(message) {
  console.error(`[minify_panorama_js] ${message}`);
  process.exit(1);
}

function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

function isIdentifierChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function tokenCanEndStatement(tokenType, tokenValue) {
  if (!tokenType) return false;
  if (tokenType === "word" || tokenType === "number" || tokenType === "literal") return true;
  if (tokenType === "operator") {
    return /^(?:\)|\]|\}|\+\+|--)$/.test(tokenValue);
  }
  return false;
}

function tokenStartsRestrictedStatement(nextType, nextValue) {
  return nextType === "word" && /^(?:return|throw|break|continue|yield|await)$/.test(nextValue);
}

function newlineNeedsSemicolon(prevTokenType, prevTokenValue, nextType, nextValue) {
  if (!prevTokenType || !nextType) return false;

  if (prevTokenType === "word" && /^(?:return|throw|break|continue|yield|await)$/.test(prevTokenValue)) {
    if (nextValue === ";" || nextValue === "}" || nextValue === ")") return false;
    return true;
  }

  if (tokenCanEndStatement(prevTokenType, prevTokenValue)) {
    if (nextType === "operator" && /^(?:\(|\[|\+|-|\/)$/.test(nextValue)) return true;
    if (tokenStartsRestrictedStatement(nextType, nextValue)) return true;
  }

  return false;
}

function isRegexPrefixContext(prevTokenType, prevTokenValue) {
  if (!prevTokenType) return true;
  if (prevTokenType === "word") {
    return /^(return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|new|do|else)$/.test(prevTokenValue);
  }
  if (prevTokenType === "operator") {
    return /^(?:\(|\{|\[|,|;|:|=|==|===|!=|!==|\+|-|\*|\/|%|&|\||\^|~|!|\?|<|>|<=|>=|<<|>>|>>>|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=>)$/.test(prevTokenValue);
  }
  return false;
}

function consumeQuoted(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i;
    }
    i++;
  }
  return -1;
}

function consumeRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[" && !inClass) {
      inClass = true;
      i++;
      continue;
    }
    if (ch === "]" && inClass) {
      inClass = false;
      i++;
      continue;
    }
    if (ch === "/" && !inClass) {
      i++;
      while (i < text.length && /[A-Za-z]/.test(text[i])) i++;
      return i - 1;
    }
    i++;
  }
  return -1;
}

function consumeTemplateExpression(text, start) {
  let i = start;
  let depth = 1;
  let prevTokenType = null;
  let prevTokenValue = "";

  while (i < text.length) {
    const ch = text[i];

    if (ch === "'" || ch === "\"") {
      const end = consumeQuoted(text, i, ch);
      if (end < 0) return -1;
      i = end + 1;
      prevTokenType = "literal";
      prevTokenValue = ch;
      continue;
    }

    if (ch === "`") {
      const end = consumeTemplate(text, i);
      if (end < 0) return -1;
      i = end + 1;
      prevTokenType = "literal";
      prevTokenValue = "`";
      continue;
    }

    if (ch === "/") {
      const next = text[i + 1] || "";
      if (next === "/") {
        i += 2;
        while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++;
        continue;
      }
      if (next === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) return -1;
        i = end + 2;
        continue;
      }
      if (isRegexPrefixContext(prevTokenType, prevTokenValue)) {
        const end = consumeRegex(text, i);
        if (end < 0) return -1;
        i = end + 1;
        prevTokenType = "literal";
        prevTokenValue = "/";
        continue;
      }
      prevTokenType = "operator";
      prevTokenValue = "/";
      i++;
      continue;
    }

    if (ch === "{") {
      depth++;
      prevTokenType = "operator";
      prevTokenValue = "{";
      i++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
      prevTokenType = "operator";
      prevTokenValue = "}";
      i++;
      continue;
    }

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    if (isIdentifierChar(ch)) {
      let j = i + 1;
      while (j < text.length && isIdentifierChar(text[j])) j++;
      prevTokenType = "word";
      prevTokenValue = text.slice(i, j);
      i = j;
      continue;
    }

    prevTokenType = "operator";
    prevTokenValue = ch;
    i++;
  }

  return -1;
}

function consumeTemplate(text, start) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      return i;
    }
    if (ch === "$" && text[i + 1] === "{") {
      const exprEnd = consumeTemplateExpression(text, i + 2);
      if (exprEnd < 0) return -1;
      i = exprEnd + 1;
      continue;
    }
    i++;
  }
  return -1;
}

function minifyConservative(text) {
  let out = "";
  let i = 0;
  let prevTokenType = null;
  let prevTokenValue = "";
  let pendingWhitespace = "";

  function flushWhitespace(nextType, nextValue) {
    if (!pendingWhitespace) return;
    const hadNewline = pendingWhitespace.includes("\n") || pendingWhitespace.includes("\r");
    const needSpace =
      (prevTokenType === "word" || prevTokenType === "number" || prevTokenType === "literal") &&
      (nextType === "word" || nextType === "number" || nextType === "literal");
    if (hadNewline && newlineNeedsSemicolon(prevTokenType, prevTokenValue, nextType, nextValue)) {
      out += ";";
    } else if (needSpace) {
      out += " ";
    }
    pendingWhitespace = "";
  }

  while (i < text.length) {
    const ch = text[i];

    if (isWhitespace(ch)) {
      let j = i + 1;
      while (j < text.length && isWhitespace(text[j])) j++;
      pendingWhitespace += text.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      let j = i + 2;
      while (j < text.length && text[j] !== "\n" && text[j] !== "\r") j++;
      pendingWhitespace += "\n";
      i = j;
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) fail("Unterminated block comment.");
      const commentBody = text.slice(i, end + 2);
      pendingWhitespace += /[\r\n]/.test(commentBody) ? "\n" : " ";
      i = end + 2;
      continue;
    }

    if (ch === "'" || ch === "\"") {
      const end = consumeQuoted(text, i, ch);
      if (end < 0) fail("Unterminated string literal.");
      flushWhitespace("literal", ch);
      out += text.slice(i, end + 1);
      prevTokenType = "literal";
      prevTokenValue = ch;
      i = end + 1;
      continue;
    }

    if (ch === "`") {
      const end = consumeTemplate(text, i);
      if (end < 0) fail("Unterminated template literal.");
      flushWhitespace("literal", "`");
      out += text.slice(i, end + 1);
      prevTokenType = "literal";
      prevTokenValue = "`";
      i = end + 1;
      continue;
    }

    if (ch === "/") {
      if (isRegexPrefixContext(prevTokenType, prevTokenValue)) {
        const end = consumeRegex(text, i);
        if (end < 0) fail("Unterminated regex literal.");
        flushWhitespace("literal", "/");
        out += text.slice(i, end + 1);
        prevTokenType = "literal";
        prevTokenValue = "/";
        i = end + 1;
        continue;
      }
      flushWhitespace("operator", "/");
      out += "/";
      prevTokenType = "operator";
      prevTokenValue = "/";
      i++;
      continue;
    }

    if (isIdentifierChar(ch)) {
      let j = i + 1;
      while (j < text.length && isIdentifierChar(text[j])) j++;
      const word = text.slice(i, j);
      const tokenType = /^[0-9]/.test(word) ? "number" : "word";
      flushWhitespace(tokenType, word);
      out += word;
      prevTokenType = tokenType;
      prevTokenValue = word;
      i = j;
      continue;
    }

    flushWhitespace("operator", ch);
    out += ch;
    prevTokenType = "operator";
    prevTokenValue = ch;
    i++;
  }

  return out.trim();
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) fail("Usage: node scripts/minify_panorama_js.js <staged-js-file>");

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) fail(`File not found: ${resolved}`);

  let source = fs.readFileSync(resolved, "utf8");
  if (source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1);
  }

  const originalBytes = Buffer.byteLength(source, "utf8");
  if (originalBytes === 0) fail(`Refusing to minify empty file: ${resolved}`);

  const minified = minifyConservative(source);
  const minifiedBytes = Buffer.byteLength(minified, "utf8");
  const lineCount = minified.length === 0 ? 0 : minified.split(/\r\n|\r|\n/).length;

  if (!minified || minified.trim().length === 0) fail(`Minified output was empty: ${resolved}`);
  if (minifiedBytes > originalBytes + 128) fail(`Minified output grew suspiciously: ${resolved}`);
  if (minifiedBytes < Math.max(32, Math.floor(originalBytes * 0.03))) fail(`Minified output looks truncated: ${resolved}`);
  if (lineCount !== 1) fail(`Minified output was expected to be one line but got ${lineCount}: ${resolved}`);

  try {
    new vm.Script(minified, { filename: resolved });
  } catch (err) {
    fail(`Minified output failed syntax validation for ${resolved}: ${err.message}`);
  }

  fs.writeFileSync(resolved, minified, "utf8");
  process.stdout.write(JSON.stringify({
    file: resolved,
    originalBytes,
    minifiedBytes,
    savedBytes: Math.max(0, originalBytes - minifiedBytes),
    lineCount
  }) + "\n");
}

main();
