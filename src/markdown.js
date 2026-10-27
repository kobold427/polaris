'use strict';

const DATE = '\\d{4}-\\d{2}-\\d{2}';
const TASK_RE = /^(\s*)([-*+]|\d+[.)])\s+\[(.)\]\s?(.*)$/;
const TOKEN_RE = new RegExp(
  `\\s*(?:📅|⏳|🛫|➕|✅|❌)\\uFE0F?\\s*${DATE}|\\s*\\[(?:due|scheduled|start|completion|created|cancelled)::\\s*${DATE}\\]`, 'gu');
const DUE_RE = new RegExp(`(?:📅\\uFE0F?\\s*|\\[due::\\s*)(${DATE})`, 'u');
const SCHED_RE = new RegExp(`(?:⏳\\uFE0F?\\s*|\\[scheduled::\\s*)(${DATE})`, 'u');
const DONE_RE = new RegExp(`(?:✅\\uFE0F?\\s*|\\[completion::\\s*)(${DATE})`, 'u');
const DONE_TOKEN_RE = new RegExp(`\\s*(?:✅\\uFE0F?\\s*${DATE}|\\[completion::\\s*${DATE}\\])`, 'gu');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function splitLines(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(/\r?\n/), eol };
}

function parseLine(raw, index) {
  const m = TASK_RE.exec(raw);
  if (!m) return null;
  const body = m[4];
  const status = m[3];
  const tokens = (body.match(TOKEN_RE) || []).map((s) => s.trim());
  return {
    line: index,
    raw,
    indent: m[1],
    status,
    done: status === 'x' || status === 'X' || status === '-',
    cancelled: status === '-',
    title: body.replace(TOKEN_RE, '').trim(),
    due: (DUE_RE.exec(body) || [])[1] || null,
    scheduled: (SCHED_RE.exec(body) || [])[1] || null,
    doneDate: (DONE_RE.exec(body) || [])[1] || null,
    recurring: body.includes('🔁'),
    tokens,
  };
}

function parseTasks(text) {
  const { lines, eol } = splitLines(text || '');
  const tasks = [];
  lines.forEach((raw, i) => {
    const t = parseLine(raw, i);
    if (t) tasks.push(t);
  });
  return { lines, eol, tasks };
}

function locate(lines, line, raw) {
  if (lines[line] === raw) return line;
  return lines.indexOf(raw);
}

function join(lines, eol) {
  return lines.join(eol);
}

function appendTask(text, title, due) {
  const { lines, eol } = splitLines(text || '');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push(`- [ ] ${title.trim()}${due ? ` 📅 ${due}` : ''}`);
  lines.push('');
  return join(lines, eol);
}

function toggleLine(text, idx, today) {
  const { lines, eol } = splitLines(text);
  const t = parseLine(lines[idx], idx);
  if (!t) return null;
  let line = lines[idx];
  if (t.done) {
    line = line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[.\]/, '$1[ ]').replace(DONE_TOKEN_RE, '');
  } else {
    line = line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[.\]/, '$1[x]').replace(/\s+$/, '') + ` ✅ ${today}`;
  }
  lines[idx] = line;
  return join(lines, eol);
}

function editLine(text, idx, newTitle) {
  const { lines, eol } = splitLines(text);
  const t = parseLine(lines[idx], idx);
  if (!t) return null;
  const marker = `${t.indent}${/^\s*(\S+)/.exec(lines[idx])[1]} [${t.status}] `;
  lines[idx] = marker + newTitle.trim() + t.tokens.map((s) => ` ${s}`).join('');
  return join(lines, eol);
}

function removeLine(text, idx) {
  const { lines, eol } = splitLines(text);
  if (!parseLine(lines[idx], idx)) return null;
  lines.splice(idx, 1);
  return join(lines, eol);
}

function dateTasks(text) {
  const out = [];
  if (!text || (!text.includes('📅') && !text.includes('⏳') && !text.includes('::'))) return out;
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = parseLine(raw, i);
    if (!t) return;
    const date = t.due || t.scheduled;
    if (date) out.push({ line: i, raw, title: t.title, done: t.done, date });
  });
  return out;
}

const LOCALES = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daysMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  },
  ru: {
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    monthsShort: ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
    days: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
    daysShort: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
    daysMin: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  },
};

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

function formatMoment(d, fmt, locale = 'en') {
  const L = LOCALES[locale] || LOCALES.en;
  const dayOfYear = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const ordinal = (n) => (locale === 'ru' ? `${n}-е` : n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th'));
  const h12 = d.getHours() % 12 || 12;
  const map = {
    YYYY: () => String(d.getFullYear()), YY: () => String(d.getFullYear()).slice(-2),
    MMMM: () => L.months[d.getMonth()], MMM: () => L.monthsShort[d.getMonth()],
    MM: () => pad(d.getMonth() + 1), M: () => String(d.getMonth() + 1),
    DDDD: () => String(dayOfYear).padStart(3, '0'), DDD: () => String(dayOfYear),
    DD: () => pad(d.getDate()), Do: () => ordinal(d.getDate()), D: () => String(d.getDate()),
    dddd: () => L.days[d.getDay()], ddd: () => L.daysShort[d.getDay()], dd: () => L.daysMin[d.getDay()], d: () => String(d.getDay()),
    E: () => String(d.getDay() || 7),
    WW: () => pad(isoWeek(d)), W: () => String(isoWeek(d)), ww: () => pad(isoWeek(d)), w: () => String(isoWeek(d)),
    gggg: () => String(d.getFullYear()), GGGG: () => String(d.getFullYear()),
    Q: () => String(Math.floor(d.getMonth() / 3) + 1),
    HH: () => pad(d.getHours()), H: () => String(d.getHours()),
    hh: () => pad(h12), h: () => String(h12),
    mm: () => pad(d.getMinutes()), m: () => String(d.getMinutes()),
    ss: () => pad(d.getSeconds()), s: () => String(d.getSeconds()),
    A: () => (d.getHours() < 12 ? 'AM' : 'PM'), a: () => (d.getHours() < 12 ? 'am' : 'pm'),
  };
  const re = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|Do|D|dddd|ddd|dd|d|E|WW|W|ww|w|gggg|GGGG|Q|HH|H|hh|h|mm|m|ss|s|A|a/g;
  return fmt.replace(re, (tok, esc) => (esc !== undefined ? esc : map[tok]()));
}

module.exports = {
  ymd, pad, TASK_RE, parseLine, parseTasks, splitLines, locate, appendTask, toggleLine, editLine, removeLine,
  dateTasks, formatMoment, isoWeek,
};
