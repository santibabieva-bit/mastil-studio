/** Helpers mínimos para construir DOM sin dependencias. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

let uid = 0;
export function nextId(prefix = 'f') {
  uid += 1;
  return `${prefix}${uid}`;
}

export function field(label, control, hint = null) {
  const id = control.id || nextId();
  if (!control.id && 'id' in control) control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
}

export function select(options, value, onChange, attrs = {}) {
  const el = h('select', attrs);
  for (const option of options) {
    const opt = typeof option === 'object' ? option : { value: option, label: String(option) };
    el.append(h('option', { value: opt.value, selected: String(opt.value) === String(value) }, opt.label));
  }
  el.value = String(value);
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

/** Botones segmentados exclusivos. */
export function segmented(options, value, onChange, attrs = {}) {
  const wrap = h('div', { class: 'segmented', role: 'group', ...attrs });
  const buttons = new Map();
  const set = (next) => {
    for (const [val, btn] of buttons) {
      btn.classList.toggle('is-active', String(val) === String(next));
      btn.setAttribute('aria-pressed', String(String(val) === String(next)));
    }
  };
  for (const option of options) {
    const opt = typeof option === 'object' ? option : { value: option, label: String(option) };
    const btn = h('button', { type: 'button', title: opt.title }, opt.label);
    btn.addEventListener('click', () => {
      set(opt.value);
      onChange(opt.value);
    });
    buttons.set(opt.value, btn);
    wrap.append(btn);
  }
  set(value);
  wrap.setValue = set;
  return wrap;
}

export function slider({ min, max, step = 1, value, onInput, format = (v) => v, label = '' }) {
  const out = h('output', {}, format(value));
  const input = h('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    out.textContent = format(Number(input.value));
    onInput(Number(input.value));
  });
  const wrap = h('div', { class: 'slider' }, label ? h('span', { class: 'slider-label' }, label) : null, input, out);
  wrap.input = input;
  wrap.setValue = (v) => {
    input.value = v;
    out.textContent = format(Number(v));
  };
  return wrap;
}

export function toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  const row = h('label', { class: 'switch-row' }, input, h('span', { class: 'switch', 'aria-hidden': 'true' }, h('span')), h('span', {}, label));
  row.input = input;
  return row;
}

export function button(label, { variant = 'outline', onClick, title, attrs = {} } = {}) {
  const btn = h('button', { type: 'button', class: `btn btn-${variant}`, title, ...attrs }, label);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export function panel(title, ...children) {
  return h('section', { class: 'panel' }, title ? h('h2', {}, title) : null, ...children);
}

export function pill(text, cls = '') {
  return h('span', { class: `pill ${cls}`.trim() }, text);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}
