"use strict";

// Source safety checks only. Native compilation owns CSS grammar and resources.
const fs = require("node:fs");
const path = require("node:path");

// The current client reads each complete selector list into a 0x800-byte buffer.
// Leave one byte for its terminator. Whitespace normalization is conservative:
// the compiler can remove more spaces, but source must fit without relying on it.
const SELECTOR_LIST_MAX_BYTES = 2047;

function scanSource(source, file = "<source>") {
    const stack = [];
    const openings = "{([";
    const closings = "})]";
    let line = 1;
    let column = 1;
    let string = null;
    let comment = null;
    let escaped = false;
    let header = "";
    let headerPosition = null;
    const issue = (message, position) => ({ file, line: position.line, column: position.column, message });
    const appendHeader = (token, position, literal = false) => {
        if (!literal && /\s/.test(token)) {
            if (header && !header.endsWith(" ")) header += " ";
        } else {
            if (!headerPosition) headerPosition = position;
            header += token;
        }
    };

    for (let index = 0; index < source.length; index++) {
        const token = source[index];
        const position = { line, column };
        if (token === "\n") { line++; column = 1; }
        else column++;

        if (comment) {
            if (token === "*" && source[index + 1] === "/") { comment = null; index++; column++; }
            continue;
        }
        if (string) {
            appendHeader(token, position, true);
            if (escaped) escaped = false;
            else if (token === "\\") escaped = true;
            else if (token === string.quote) string = null;
            continue;
        }
        if (token === "/" && source[index + 1] === "*") { comment = position; index++; column++; continue; }
        if (token === "\"" || token === "'") {
            appendHeader(token, position, true);
            string = { quote: token, ...position };
            continue;
        }
        if (token === "{") {
            const selector = header.trim();
            const bytes = Buffer.byteLength(selector, "utf8");
            if (!selector.startsWith("@") && bytes > SELECTOR_LIST_MAX_BYTES) {
                return [issue(`Selector list is ${bytes} bytes; source budget is ${SELECTOR_LIST_MAX_BYTES}. Split the rule before the client's 2048-byte buffer overflows.`, headerPosition || position)];
            }
        }
        if (token === "{" || token === "}" || token === ";") {
            header = "";
            headerPosition = null;
        } else appendHeader(token, position);
        if (openings.includes(token)) stack.push({ token, ...position });
        else if (closings.includes(token)) {
            const opening = stack.at(-1);
            if (!opening || openings.indexOf(opening.token) !== closings.indexOf(token)) {
                return [issue(`Unexpected '${token}'${opening ? `; '${opening.token}' opened at ${opening.line}:${opening.column}` : ""}`, position)];
            }
            stack.pop();
        }
    }
    if (comment) return [issue("Unterminated block comment", comment)];
    if (string) return [issue("Unterminated quoted string", string)];
    if (stack.length) {
        const opening = stack.at(-1);
        return [issue(`Unclosed '${opening.token}'`, opening)];
    }
    return [];
}

function scanDirectory(directory) {
    const files = [];
    const collect = parent => {
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
            const file = path.join(parent, entry.name);
            if (entry.isDirectory()) collect(file);
            else if (entry.isFile() && entry.name.endsWith(".css")) files.push(file);
        }
    };
    collect(directory);
    if (!files.length) throw new Error(`No CSS sources in ${directory}`);
    const issues = files.sort().flatMap(file => scanSource(fs.readFileSync(file, "utf8"), file));
    return { files, issues };
}

if (require.main === module) {
    try {
        const result = scanDirectory(process.argv[2] || path.join(__dirname, "..", "panorama", "styles"));
        for (const issue of result.issues) console.error(`${issue.file}:${issue.line}:${issue.column}: ${issue.message}`);
        console.log(`[ValidateStyles] ${result.files.length} CSS sources; ${result.issues.length} source errors. Native compilation remains required.`);
        if (result.issues.length) process.exitCode = 1;
    } catch (error) {
        console.error(`[ValidateStyles] ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { scanSource, scanDirectory, SELECTOR_LIST_MAX_BYTES };
