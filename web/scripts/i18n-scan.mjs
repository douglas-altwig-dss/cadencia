#!/usr/bin/env node
// Lists string literals and JSX text that look like user-visible Portuguese, so a screen's owner can
// see what is still hard-coded (docs/i18n.md). A heuristic: it reads the syntax tree (comments are not
// in it), skips imports, object keys, type literals, className/style values, comparisons and
// route/storage-key-looking strings, and flags what has pt-BR accents or common Portuguese words.
//
//   npm run i18n:scan                       # all of src/
//   npm run i18n:scan -- src/pages/Foo.tsx  # only these files or folders
//   npm run i18n:scan -- --strict           # exit 1 when anything is found

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'rolldown/utils';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const targets = args.filter((a) => !a.startsWith('--'));

// ---- which files ----------------------------------------------------------------------------------

function excluded(file) {
  const rel = relative(SRC, file).split(sep).join('/');
  return rel.startsWith('i18n/') || /\.test\.tsx?$/.test(rel) || rel.endsWith('.d.ts');
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !excluded(path)) out.push(path);
  }
  return out;
}

function resolveTarget(target) {
  // npm runs scripts from the package root; INIT_CWD is where the person typed the command.
  for (const base of [process.env.INIT_CWD, process.cwd(), WEB]) {
    if (!base) continue;
    const path = resolve(base, target);
    if (existsSync(path)) return path;
  }
  console.error(`i18n-scan: not found: ${target}`);
  process.exit(2);
}

const files = (targets.length ? targets.map(resolveTarget) : [SRC])
  .flatMap((path) => (statSync(path).isDirectory() ? walk(path, []) : excluded(path) ? [] : [path]))
  .sort();

// ---- what looks Portuguese ------------------------------------------------------------------------

const ACCENTS = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
/** Words that are Portuguese on their own (none of them is an English word or a common identifier). */
const STRONG = new Set(
  `não nao sem nenhum nenhuma nenhuns salvar salvo salva excluir excluído cancelar carregando erro erros
  itens pessoas pessoa encerrada encerrado aberta aberto fechar abrir adicionar remover editar voltar
  buscar próximo anterior mostrar ocultar escolha escolher selecione atualizar atualizado gerar baixar
  enviar copiar desfazer refazer confirmar sair entrar ainda hoje ontem amanhã semana semanas dias horas
  todos todas nada também então agora nunca sempre aqui depois antes porque quando onde qual quais
  obrigatório opcional tarefa tarefas subtarefa subtarefas épico modelo modelos variável variáveis
  apresentação prévia coleta espaço espaços equipe papel papéis função capacidade carga entregas
  bloqueado bloqueados bloqueio atrasado atrasados parado parados situação risco riscos vazão previsão`
    .split(/\s+/)
    .filter(Boolean),
);
/** Function words: Portuguese only next to another word ("de", "da" alone are locale ids). */
const WEAK = new Set(
  'de da das dos em na nas nos ou um uma com para sem ao aos que por mais pelo pela pelos pelas este esta essa isso como seu sua'.split(' '),
);

const IDENTIFIER = /^[\w\-./:?=&#%{}*|@+,[\]()<>!$~^;]+$/;

/**
 * `visible` is true where the text is certainly shown (JSX text, a `label`, an `aria-label`, a `plural()`
 * argument). Elsewhere a lone lowercase word such as 'bloqueado' is far more often a wire value or a
 * state name than a label, so it is let through.
 */
function looksPortuguese(raw, visible) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(text)) return false;
  if (!visible && /^[a-z]+$/.test(text)) return false;
  if (/^(https?:|mailto:|data:)/.test(text)) return false;
  if (/^[/?#]/.test(text) || text.includes('?tab=') || /^cadencia[-:.]/.test(text)) return false;
  if (!/\s/.test(text) && IDENTIFIER.test(text) && /[_\-./:=]/.test(text)) return false;
  // An accented word is Portuguese unless it is a dotted/underscored key such as `espaço.nome`.
  if (ACCENTS.test(text)) return /\s/.test(text) || !/[_.:/]/.test(text);
  // Whole words only: a token with a digit or a symbol inside (`48em`, `a.b`) is not a word.
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((token) => /^\p{L}+$/u.test(token));
  if (words.some((w) => STRONG.has(w))) return true;
  return words.length >= 2 && words.some((w) => WEAK.has(w));
}

// ---- the tree walk --------------------------------------------------------------------------------

const SKIP_ATTRIBUTES = new Set(['className', 'classNames', 'style', 'styles', 'key', 'id', 'href', 'to', 'src', 'path', 'ref', 'htmlFor']);
const COMPARISONS = new Set(['===', '!==', '==', '!=', 'in']);
/** Object keys and JSX attributes whose string is shown to a person. */
const VISIBLE_NAMES = new Set([
  'label', 'title', 'description', 'placeholder', 'aria-label', 'alt', 'message', 'tooltip', 'body', 'error',
  'confirmLabel', 'cancelLabel', 'hint', 'help', 'text', 'caption', 'empty', 'summary', 'action', 'cause',
]);
/** Object keys whose string is a value the code switches on, never shown. */
const VALUE_NAMES = new Set(['value', 'id', 'key', 'type', 'kind', 'tab', 'mode', 'state', 'status', 'variant', 'color', 'c', 'icon', 'code', 'mantine']);

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXNamespacedName') return `${node.namespace.name}:${node.name.name}`;
  return '';
}

function isConsoleCall(node) {
  const callee = node.callee;
  return callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier' && callee.object.name === 'console';
}

function scan(file) {
  const source = readFileSync(file, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const result = parseSync(file, source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' });
  const hits = [];
  if (result.errors?.length) {
    hits.push({ line: 0, text: `(parse error: ${result.errors[0].message})` });
    return hits;
  }
  const report = (node, text, visible) => {
    if (looksPortuguese(text, visible)) hits.push({ line: lineOf(node.start), text: text.replace(/\s+/g, ' ').trim() });
  };

  // `visible`: the string directly below is known to be shown (see VISIBLE_NAMES).
  const visit = (node, visible = false) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, visible);
      return;
    }
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'TSImportType':
      case 'TSLiteralType':
      case 'TSExternalModuleReference':
      case 'TSModuleDeclaration':
      case 'TSEnumMember':
        return; // module paths and types, never shown
      case 'ImportExpression':
        return;
      case 'ExportNamedDeclaration':
        visit(node.declaration);
        return;
      case 'CallExpression':
        if (isConsoleCall(node)) return;
        if (node.callee?.type === 'Identifier' && node.callee.name === 'plural') {
          visit(node.callee);
          visit(node.arguments, true);
          return;
        }
        break;
      case 'Literal':
        if (typeof node.value === 'string') report(node, node.value, visible);
        return;
      case 'TemplateLiteral':
        report(node, node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('{…}'), visible);
        for (const expression of node.expressions) visit(expression);
        return;
      case 'TaggedTemplateExpression':
        visit(node.tag);
        for (const expression of node.quasi.expressions) visit(expression);
        return;
      case 'JSXText':
        report(node, node.value, true);
        return;
      case 'JSXAttribute': {
        const name = jsxName(node.name);
        if (SKIP_ATTRIBUTES.has(name) || name.startsWith('data-')) return;
        visit(node.value, VISIBLE_NAMES.has(name));
        return;
      }
      case 'Property':
      case 'PropertyDefinition':
      case 'MethodDefinition':
      case 'TSPropertySignature':
      {
        if (node.computed) visit(node.key);
        const name = node.key?.name ?? node.key?.value;
        if (!node.computed && VALUE_NAMES.has(name) && node.value?.type === 'Literal') return;
        visit(node.value, !node.computed && VISIBLE_NAMES.has(name));
        return;
      }
      case 'MemberExpression':
        visit(node.object);
        if (node.computed && !(node.property?.type === 'Literal')) visit(node.property);
        return;
      case 'BinaryExpression':
        if (COMPARISONS.has(node.operator)) {
          for (const side of [node.left, node.right]) if (!(side?.type === 'Literal' && typeof side.value === 'string')) visit(side);
          return;
        }
        break;
      case 'SwitchCase':
        if (!(node.test?.type === 'Literal')) visit(node.test);
        visit(node.consequent);
        return;
      default:
        if (node.type?.startsWith('TS') && node.type.endsWith('Type')) return; // type positions
    }
    for (const key in node) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'range' || key === 'loc') continue;
      const value = node[key];
      if (value && typeof value === 'object') visit(value);
    }
  };
  visit(result.program);
  return hits;
}

// ---- report ---------------------------------------------------------------------------------------

const counts = [];
let total = 0;
for (const file of files) {
  const hits = scan(file);
  if (!hits.length) continue;
  const rel = relative(WEB, file).split(sep).join('/');
  for (const hit of hits) {
    const text = hit.text.length > 90 ? `${hit.text.slice(0, 87)}…` : hit.text;
    console.log(`${rel}:${hit.line}: ${text}`);
  }
  counts.push([rel, hits.length]);
  total += hits.length;
}

if (counts.length) {
  console.log('\nPer file:');
  for (const [rel, count] of counts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`${String(count).padStart(6)}  ${rel}`);
  }
}
console.log(`\ni18n-scan: ${total} possible Portuguese ${total === 1 ? 'string' : 'strings'} in ${counts.length} of ${files.length} files.`);
process.exit(strict && total > 0 ? 1 : 0);
