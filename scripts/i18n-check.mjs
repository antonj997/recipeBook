// Checks that every word the app shows can be translated: template text and labels go through
// the `t` pipe, sentences in TypeScript go through t()/plural()/msg(), every key has Swedish
// wording, and the Swedish dictionary holds no unused entries. Run: npm run i18n:check
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(root, 'src/app');
const { sv } = await import(join(root, 'src/app/core/i18n/sv.ts'));

// Words that are the same in every language: the app's name and units.
const universal = new Set([
  'Recipebook',
  'kcal',
  'g',
  'MM:SS',
  '00:00',
  'R',
  'A',
  'Open Food Facts',
  'Livsmedelsverket',
]);
const labelAttributes = ['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'label'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = [join(root, 'src/main.ts'), ...walk(appDir)].filter(
  (path) => /\.(ts|html)$/.test(path) && !/\.spec\.ts$|\.testing\.ts$/.test(path),
);

const problems = [];
const keys = new Set();
const quoted = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unescape = (text) => text.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
const unquote = (match) => unescape(match[1] ?? match[2] ?? '');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const looksLikeText = (value) =>
  /\p{L}/u.test(value) && !universal.has(value.trim()) && /(^\p{Lu}|\s)/u.test(value.trim());

/** The text of each balanced `( … )` group that is followed by `| t`. */
function pipedGroups(source) {
  const groups = [];
  for (const pipe of source.matchAll(/\)\s*\|\s*t\b/g)) {
    let depth = 0;
    for (let i = pipe.index; i >= 0; i--) {
      if (source[i] === ')') depth++;
      else if (source[i] === '(' && --depth === 0) {
        groups.push(source.slice(i + 1, pipe.index));
        break;
      }
    }
  }
  return groups;
}

/** Whether the literal at `index` sits inside a `( … ) | t` group. */
function insidePipedGroup(expression, index) {
  let depth = 0;
  for (let i = index; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    else if (expression[i] === ')' && depth-- === 0)
      return /^\)\s*\|\s*t\b/.test(expression.slice(i));
  }
  return false;
}

/** Literals at the top level of an argument list or group: the translatable branches, not
 *  nested option objects, calls or comparisons such as `mode() === 'signup'`. */
function topLevelLiterals(text) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if ((c === "'" || c === '"') && depth === 0) {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      const comparison = /[!=]==?\s*$/.test(text.slice(0, i));
      if (!comparison) found.push(unescape(text.slice(i + 1, j)));
      i = j;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      i = j;
    }
  }
  return found;
}

/** The argument text of each `t(…)`, `msg(…)` and `plural(…)` call, balanced. */
function callArguments(source) {
  const calls = [];
  for (const call of source.matchAll(/\b(?:t|msg|plural)\(/g)) {
    let depth = 1;
    let i = call.index + call[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    calls.push({ start: call.index + call[0].length, end: i - 1 });
  }
  return calls;
}

function collectKeys(source) {
  const patterns = [
    new RegExp(`(?:${quoted})\\s*\\|\\s*t\\b`, 'g'),
    new RegExp(`\\b(?:t|msg)\\(\\s*(?:${quoted})`, 'g'),
  ];
  for (const pattern of patterns)
    for (const match of source.matchAll(pattern)) keys.add(unquote(match));
  // Every literal inside t(…)/msg(…)/plural(…) is a key, e.g. t(error ? message : 'Fallback').
  for (const call of callArguments(source))
    for (const literal of topLevelLiterals(source.slice(call.start, call.end))) keys.add(literal);
  // `(cond ? 'A' : 'B') | t` translates every literal in the group.
  for (const group of pipedGroups(source))
    for (const literal of topLevelLiterals(group)) keys.add(literal);
  const pluralPipe = new RegExp(`\\|\\s*plural\\s*:\\s*(?:${quoted})\\s*:\\s*(?:${quoted})`, 'g');
  for (const match of source.matchAll(pluralPipe)) {
    keys.add(unescape(match[1] ?? match[2]));
    keys.add(unescape(match[3] ?? match[4]));
  }
  const pluralPattern = new RegExp(
    `\\bplural\\([^,]+,\\s*(?:${quoted})\\s*,\\s*(?:${quoted})`,
    'g',
  );
  for (const match of source.matchAll(pluralPattern)) {
    keys.add(unescape(match[1] ?? match[2]));
    keys.add(unescape(match[3] ?? match[4]));
  }
}

const blank = (text) => text.replace(/[^\n]/g, ' ');

/** Blanks `@if (…)`-style control flow, including parentheses nested in its expression. */
function blankControlFlow(template) {
  let out = '';
  let index = 0;
  const pattern = /@(?:if|else if|for|switch|case|defer|placeholder|loading|let)\b\s*(\()?/g;
  for (const match of template.matchAll(pattern)) {
    if (match.index < index) continue;
    out += template.slice(index, match.index);
    let end = match.index + match[0].length;
    if (match[1]) {
      for (let depth = 1; end < template.length && depth > 0; end++) {
        if (template[end] === '(') depth++;
        else if (template[end] === ')') depth--;
      }
    } else if (/@let\b/.test(match[0])) end = template.indexOf(';', end) + 1;
    out += blank(template.slice(match.index, end));
    index = end;
  }
  return out + template.slice(index);
}

function checkTemplate(template, file, offsetLine) {
  // Text between tags, once interpolations, comments and control flow are gone.
  const stripped = blankControlFlow(
    template.replace(/<!--[\s\S]*?-->/g, blank).replace(/\{\{[\s\S]*?\}\}/g, blank),
  );
  const tags = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  let last = 0;
  for (const tag of stripped.matchAll(tags)) {
    const text = stripped.slice(last, tag.index);
    checkText(text, last);
    checkTag(tag[0], tag.index);
    last = tag.index + tag[0].length;
  }
  checkText(stripped.slice(last), last);

  function checkText(text, index) {
    const words = text
      .replace(/@(else|empty|default)\b/g, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/g, ' ')
      .trim();
    if (/\p{L}/u.test(words) && !universal.has(words))
      problems.push(
        `${file}:${offsetLine + lineOf(stripped, index) - 1} text "${words.slice(0, 60)}"`,
      );
  }
  function checkTag(tag, index) {
    for (const attribute of labelAttributes) {
      const plain = new RegExp(`\\s${attribute}="([^"]*)"`).exec(tag);
      if (plain && looksLikeText(plain[1]))
        problems.push(
          `${file}:${offsetLine + lineOf(stripped, index) - 1} ${attribute}="${plain[1]}"`,
        );
    }
    // Literal text inside bindings must be piped through t.
    for (const binding of tag.matchAll(/\s[[(]?[\w.\-[\]]+[\])]?="([^"]*)"/g)) {
      if (!/^\s[[]/.test(binding[0]) && !/^\s\[?attr\./.test(binding[0])) continue;
      if (
        /^\s\[(?:style|class|attr\.aria-(?:controls|describedby|labelledby)|id)\b/.test(binding[0])
      )
        continue;
      checkExpression(binding[1], index);
    }
  }
  // Literals in interpolations too.
  for (const interpolation of template.matchAll(/\{\{([\s\S]*?)\}\}/g))
    checkExpression(interpolation[1], interpolation.index);

  function checkExpression(expression, index) {
    for (const literal of expression.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      const value = literal[1];
      const after = expression.slice(literal.index + literal[0].length);
      const before = expression.slice(0, literal.index);
      if (/^\s*\|\s*t\b/.test(after) || /\b(?:t|msg|plural)\([^()]*$/.test(before)) continue;
      if (/^\s*\|\s*t\b/.test(after.replace(/^\s*\+[^|]*/, ''))) continue;
      if (insidePipedGroup(expression, literal.index + literal[0].length)) continue;
      if (/\|\s*plural\s*:\s*(?:'(?:[^'\\]|\\.)*'\s*:\s*)?$/.test(before)) continue;
      if (looksLikeText(value))
        problems.push(`${file}:${offsetLine + lineOf(template, index) - 1} literal '${value}'`);
    }
  }
}

function checkTypeScript(source, file) {
  const calls = callArguments(source);
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  // Sentences outside templates: string literals that read like UI text must be translated.
  const withoutTemplates = source.replace(/template: `[\s\S]*?`,/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  const withoutStyles = withoutTemplates.replace(/styles: `[\s\S]*?`,?/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  const lines = withoutStyles.split('\n');
  lines.forEach((line, index) => {
    if (/i18n-ignore/.test(lines[index - 1] ?? '')) return;
    if (/i18n-ignore|^\s*(\/\/|\*|\/\*)|^\s*import\b|console\.(error|warn|info|log)/.test(line))
      return;
    for (const literal of line.matchAll(new RegExp(`${quoted}|\`((?:[^\`\\\\]|\\\\.)*)\``, 'g'))) {
      const value = (literal[3] ?? unquote(literal)).replace(/\$\{[^}]*\}/g, 'x');
      const before = line.slice(0, literal.index);
      // Single words count too where the code clearly hands them to the UI.
      const uiSlot =
        /\b(?:label|pendingLabel|successMessage|errorMessage|title|confirm|cancel|heading|text)\s*:\s*$/.test(
          before,
        ) || /\.(?:show|set|confirm)\(\s*$/.test(before);
      // A fragment glued into a sentence, like count + ' items added', is UI text too.
      const fragment = /^\s+\p{Ll}{2,}/u.test(value) && /\+\s*$/.test(before);
      if (!fragment) {
        if (!/\p{L}{2}/u.test(value) || !/^\p{Lu}/u.test(value.trim())) continue;
        if (!/\s/.test(value) && !uiSlot) continue;
      }
      if (/\b(?:t|msg)\(\s*$|\bplural\([^()]*$|\|\s*t\b/.test(before)) continue;
      const at = lineStarts[index] + literal.index;
      if (calls.some((call) => at >= call.start && at < call.end)) continue;
      if (/new Error\(\s*$|Error\(\s*$/.test(before) && /i18n: internal/.test(line)) continue;
      problems.push(`${relative(root, file)}:${index + 1} string '${value.slice(0, 70)}'`);
    }
  });
}

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const file = relative(root, path);
  collectKeys(source);
  for (const choice of source.matchAll(/===\s*1\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/g))
    if (
      /\p{L}/u.test(choice[1]) &&
      !/^(\s*\)\s*\|\s*t\b)/.test(source.slice(choice.index + choice[0].length))
    )
      problems.push(
        `${file}:${lineOf(source, choice.index)} plural '${choice[1]}' / '${choice[2]}' (use plural)`,
      );
  if (path.endsWith('.html')) checkTemplate(source, file, 1);
  else {
    for (const match of source.matchAll(/template: `([\s\S]*?)`,/g))
      checkTemplate(match[1], file, lineOf(source, match.index));
    if (!/\/i18n\/sv\.ts$/.test(path)) checkTypeScript(source, path);
  }
}

for (const key of keys) {
  if (!(key in sv)) problems.push(`missing Swedish for '${key}'`);
  else {
    const names = (text) =>
      [...text.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join();
    if (names(key) !== names(sv[key])) problems.push(`placeholders differ in '${key}'`);
  }
}
for (const key of Object.keys(sv))
  if (!keys.has(key)) problems.push(`unused Swedish entry '${key}'`);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} i18n problem(s).`);
  process.exit(1);
}
console.log(`i18n: ${keys.size} texts, all translated.`);
