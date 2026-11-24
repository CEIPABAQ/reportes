/* Motor mínimo que reemplaza al panel de Claude: datos, cálculos con filtros y dibujos */
(function () {
  const loaders = {}, calcs = {}, draws = {}, alCambiar = [];
  let params = {}, cache = {}, crudo = null, pendiente = false;
  function cargar(id) {
    if (crudo) return crudo;
    const l = loaders[id]; const out = l ? l.fn({answer: window.DATOS}) : window.DATOS;
    crudo = Array.isArray(out) ? out : (out.rows || out.data);
    return crudo;
  }
  function data(id) {
    if (cache[id]) return cache[id];
    let res;
    try {
      if (calcs[id]) res = {status: 'ok', data: calcs[id].fn(...calcs[id].inputs.map(i => data(i).data))};
      else if (loaders[id]) res = {status: 'ok', data: cargar(id)};
      else res = {status: 'missing', data: []};
    } catch (e) { console.error(e); res = {status: 'error', data: [], message: String(e)}; }
    cache[id] = res;
    return res;
  }
  function dibujar(nombre) {
    const fn = draws[nombre]; if (!fn) return;
    document.querySelectorAll('[data-draw="' + nombre + '"]').forEach(el => { if (!el.closest('[hidden]')) { try { fn(el); } catch (e) { console.error(nombre, e); } } });
  }
  function todo() { alCambiar.forEach(f => { try { f(); } catch (e) { console.error(e); } }); Object.keys(draws).forEach(dibujar); }
  function programar() { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; todo(); }); }
  window.dash = {
    loader: (id, o) => { loaders[id] = o; },
    calc: (id, o) => { calcs[id] = o; },
    draw: (nombre, fn) => { if (fn) { draws[nombre] = fn; programar(); } else dibujar(nombre); },
    onData: fn => { alCambiar.push(fn); programar(); },
    params: () => Object.assign({}, params),
    setParams: o => { for (const k in o) { if (o[k] == null) delete params[k]; else params[k] = o[k]; } cache = {}; programar(); },
    resetParams: () => { params = {}; cache = {}; programar(); },
    data,
    setLink: id => { try { history.replaceState(null, '', '#' + id); } catch (e) {} programar(); },
    colors: ['#6c8cad', '#c8a46a']
  };
  // Lo que estaba oculto se dibuja al mostrarse (pestañas y listas desplegables)
  new MutationObserver(ms => { if (ms.some(m => m.oldValue !== null && !m.target.hasAttribute('hidden'))) programar(); })
    .observe(document.documentElement, {attributes: true, attributeFilter: ['hidden'], attributeOldValue: true, subtree: true});
  let ancho = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - ancho) > 16) { ancho = window.innerWidth; programar(); } });
})();

/* ===== Panel ===== */
/* ---------- Formatos ---------- */
const nf = new Intl.NumberFormat('es-CO');
const n0 = v => (v == null || !isFinite(v)) ? '—' : nf.format(v);
const pc = v => (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(1).replace('.', ',') + ' %';
const pc0 = v => (v == null || !isFinite(v)) ? '—' : Math.round(v * 100) + ' %';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const ymd = f => [+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)];
const fLargo = f => { if (!f) return '—'; const [y, m, d] = ymd(f); return `${d} de ${MESES[m]}`; };
const fCorto = f => { const [y, m, d] = ymd(f); return `${d} ${MES3[m]}`; };
const iso = dt => dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
const utc = f => { const [y, m, d] = ymd(f); return new Date(Date.UTC(y, m, d)); };
const addDays = (f, n) => { const t = utc(f); t.setUTCDate(t.getUTCDate() + n); return iso(t); };
const tl = s => String(s).replace('Telefono', 'Teléfono');
const PAL = {acc: '#6c8cad', acc2: '#c8a46a', mut: '#e3d8c4', accTxt: '#46668a'};
const MUT = PAL.mut;
const INICIO = '2026-10-12';
const semanaDe = f => Math.floor((utc(f) - utc(INICIO)) / 864e5 / 7) + 1;
const nucleoDe = f => { const [y, m, d] = ymd(f); let meses = (y - 2026) * 12 + (m - 9); if (d < 12) meses -= 1; return Math.floor(meses / 2) + 1; };
const inicioNucleo = n => iso(new Date(Date.UTC(2026, 9 + 2 * (n - 1), 12)));
const finNucleo = n => addDays(inicioNucleo(n + 1), -1);
const inicioSemana = s => addDays(INICIO, (s - 1) * 7);
const lista = v => Array.isArray(v) ? v.map(String) : (v != null && v !== '' ? [String(v)] : []);

/* ---------- Carga del archivo ---------- */
dash.loader('llamadas', {
  description: 'Convierte el archivo compacto en filas: cada fila es un grupo de llamadas con la misma fecha, hora, asesora, dirección, clase, tipificación e intento.',
  fn: ({answer}) => {
    const A = answer.asesoras, T = answer.tipificaciones;
    const clase = {no: 'No contestada', auto: 'Automática', efec: 'Efectiva'};
    return {
      columns: ['fecha', 'hora', 'asesora', 'equipo', 'direccion', 'clase', 'tipificacion', 'intento', 'primer_contacto', 'llamadas'],
      rows: answer.filas.map(r => ({fecha: r[0], hora: r[1], asesora: A[r[2]].nombre, equipo: A[r[2]].equipo, direccion: r[3] === 's' ? 'Saliente' : 'Entrante', clase: clase[r[4]], tipificacion: T[r[5]], intento: r[6], primer_contacto: r[7], llamadas: r[8]}))
    };
  }
});

/* ---------- Cálculos ---------- */
function medir(rows) {
  let llamadas = 0, conectadas = 0, efectivas = 0, rellamadas = 0, primeros = 0, primer_contacto = 0;
  for (const r of rows) {
    llamadas += r.llamadas;
    if (r.clase !== 'No contestada') conectadas += r.llamadas;
    if (r.clase === 'Efectiva') efectivas += r.llamadas;
    if (r.intento >= 2) rellamadas += r.llamadas;
    if (r.intento === 1) primeros += r.llamadas;
    if (r.primer_contacto === 1) primer_contacto += r.llamadas;
  }
  const div = (a, b) => b ? a / b : null;
  return {llamadas, conectadas, efectivas, no_conectadas: llamadas - conectadas, rellamadas, primeros, primer_contacto,
    pct_conect: div(conectadas, llamadas), pct_no: div(llamadas - conectadas, llamadas), pct_efec: div(efectivas, conectadas),
    efec_llamadas: div(efectivas, llamadas), pct_rellamadas: div(rellamadas, llamadas)};
}
function agrupar(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

dash.calc('filtro', {
  inputs: ['llamadas'], title: 'Llamadas con los filtros aplicados',
  description: 'Filas del archivo que cumplen los filtros de fecha, semanas, núcleos, equipos y asesoras (en cada filtro se puede marcar más de una opción).',
  fn: (llamadas) => {
    const p = dash.params();
    const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return llamadas.filter(r =>
      (!p.desde || r.fecha >= p.desde) && (!p.hasta || r.fecha <= p.hasta) &&
      (!sem.length || sem.includes(semanaDe(r.fecha))) && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) &&
      (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.asesora)));
  }
});
dash.calc('kpi_s', {
  inputs: ['filtro'], title: 'Indicadores de salientes', description: 'Totales y porcentajes de las llamadas salientes filtradas.',
  fn: (filtro) => { const s = filtro.filter(r => r.direccion === 'Saliente'); const f = s.map(r => r.fecha).sort();
    return [{desde: f[0] || null, hasta: f[f.length - 1] || null, ...medir(s)}]; }
});
function entrantes(rows) { return rows.filter(r => r.direccion === 'Entrante').map(r => r.clase === 'No contestada' ? r : Object.assign({}, r, {clase: 'Efectiva'})); }
dash.calc('kpi_e', {
  inputs: ['filtro'], title: 'Indicadores de entrantes', description: 'Totales de las llamadas entrantes filtradas. En entrantes, toda llamada conectada cuenta como efectiva.',
  fn: (filtro) => [medir(entrantes(filtro))]
});
dash.calc('equipos_s', {
  inputs: ['filtro'], title: 'Salientes por equipo', description: 'Indicadores de salientes de Posgrados y Pregrados.',
  fn: (filtro) => ['Posgrados', 'Pregrados'].map(e => ({equipo: e, ...medir(filtro.filter(r => r.direccion === 'Saliente' && r.equipo === e))})).filter(r => r.llamadas > 0)
});
dash.calc('asesoras_s', {
  inputs: ['filtro'], title: 'Salientes por asesora', description: 'Indicadores de salientes de cada asesora.',
  fn: (filtro) => [...agrupar(filtro.filter(r => r.direccion === 'Saliente'), 'asesora')].map(([a, rs]) => ({asesora: a, equipo: rs[0].equipo, ...medir(rs)})).sort((x, y) => y.llamadas - x.llamadas)
});
dash.calc('asesoras_e', {
  inputs: ['filtro'], title: 'Entrantes por asesora', description: 'Indicadores de entrantes de cada asesora. Toda entrante conectada cuenta como efectiva.',
  fn: (filtro) => [...agrupar(entrantes(filtro), 'asesora')].map(([a, rs]) => ({asesora: a, equipo: rs[0].equipo, ...medir(rs)})).sort((x, y) => y.llamadas - x.llamadas)
});
dash.calc('diario_s', {
  inputs: ['filtro'], title: 'Salientes por día', description: 'Llamadas, conectadas y efectivas de cada día.',
  fn: (filtro) => [...agrupar(filtro.filter(r => r.direccion === 'Saliente'), 'fecha')].map(([f, rs]) => ({fecha: f, ...medir(rs)})).sort((x, y) => x.fecha < y.fecha ? -1 : 1)
});
dash.calc('horas_s', {
  inputs: ['filtro'], title: 'Salientes por hora', description: 'Indicadores de salientes por hora de inicio.',
  fn: (filtro) => [...agrupar(filtro.filter(r => r.direccion === 'Saliente'), 'hora')].sort((x, y) => x[0] - y[0]).map(([h, rs]) => ({hora: String(h).padStart(2, '0') + ':00', ...medir(rs)}))
});
dash.calc('mejor_hora', {
  inputs: ['horas_s'], title: 'Mejor hora', description: 'Hora con mayor porcentaje de conectadas entre las que tienen al menos el 5 % de las llamadas.',
  fn: (horas_s) => { const tot = horas_s.reduce((s, h) => s + h.llamadas, 0); const c = horas_s.filter(h => h.llamadas >= tot * 0.05).sort((a, b) => b.pct_conect - a.pct_conect);
    return c.length ? [{hora: c[0].hora, pct_conect: c[0].pct_conect}] : []; }
});
dash.calc('nc_tip', {
  inputs: ['filtro'], title: 'No conectadas por tipificación', description: 'Cantidad y porcentaje de cada tipificación entre las salientes no conectadas.',
  fn: (filtro) => { const nc = filtro.filter(r => r.direccion === 'Saliente' && r.clase === 'No contestada'); const tot = nc.reduce((s, r) => s + r.llamadas, 0);
    return [...agrupar(nc, 'tipificacion')].map(([t, rs]) => { const n = rs.reduce((s, r) => s + r.llamadas, 0); return {tipificacion: t, llamadas: n, pct: tot ? n / tot : null}; }).sort((a, b) => b.llamadas - a.llamadas); }
});
dash.calc('nc_asesora', {
  inputs: ['filtro'], title: 'No conectadas por asesora', description: 'No conectadas de cada asesora y su tipificación.',
  fn: (filtro) => [...agrupar(filtro.filter(r => r.direccion === 'Saliente'), 'asesora')].map(([a, rs]) => {
    const nc = rs.filter(r => r.clase === 'No contestada'); const sum = f => nc.filter(f).reduce((s, r) => s + r.llamadas, 0);
    const llamadas = rs.reduce((s, r) => s + r.llamadas, 0), no = sum(() => true);
    const sin = sum(r => r.tipificacion === 'Sin contestar'), nd = sum(r => r.tipificacion === 'Telefono no disponible'), bz = sum(r => r.tipificacion === 'Buzón'), lp = sum(r => r.tipificacion === 'Solo Local Presence');
    return {asesora: a, equipo: rs[0].equipo, llamadas, no_conectadas: no, pct_no: llamadas ? no / llamadas : null, sin_contestar: sin, no_disponible: nd, buzon: bz, solo_lp: lp, otras: no - sin - nd - bz - lp};
  }).sort((x, y) => y.llamadas - x.llamadas)
});
dash.calc('intentos_s', {
  inputs: ['filtro'], title: 'Salientes por intento', description: 'Conectadas, efectivas y primer contacto según el intento al mismo número.',
  fn: (filtro) => { const L = {1: '1.er intento', 2: '2.º intento', 3: '3.er intento', 4: '4.º intento', 5: '5.º o más'};
    const s = filtro.filter(r => r.direccion === 'Saliente');
    return [1, 2, 3, 4, 5].map(i => ({intento: L[i], ...medir(s.filter(r => r.intento === i))})); }
});

/* ---------- Texto ---------- */
function textDraw(name, fmt) {
  dash.draw(name, el => {
    const g = dash.data(el.dataset.source);
    const r = g.status === 'ok' && Array.isArray(g.data) ? g.data[+(el.dataset.row || 0)] : null;
    if (!r || r[el.dataset.field] == null) { el.textContent = '—'; return; }
    el.textContent = fmt(r[el.dataset.field]);
    if (el.hasAttribute('data-accent')) el.style.color = PAL.accTxt;
  });
}
textDraw('n', n0); textDraw('p', pc); textDraw('tx', v => String(v)); textDraw('dt', fLargo);

/* ---------- Filtros ---------- */
function rango(llamadas) {
  let a = null, b = null;
  for (const r of llamadas) { if (!a || r.fecha < a) a = r.fecha; if (!b || r.fecha > b) b = r.fecha; }
  return [a, b];
}
function etiquetaFecha(p) {
  if (!p.desde && !p.hasta) return 'Todo el periodo';
  if (p.desde === p.hasta) return fCorto(p.desde);
  return `${p.desde ? fCorto(p.desde) : 'inicio'} – ${p.hasta ? fCorto(p.hasta) : 'hoy'}`;
}
function etiquetaLista(k, vals) {
  if (!vals.length) return {semanas: 'Todas las semanas', nucleos: 'Todos los núcleos', equipos: 'Todos los equipos', asesoras: 'Todas las asesoras'}[k];
  const ord = vals.slice().sort((a, b) => (k === 'semanas' || k === 'nucleos') ? a - b : a.localeCompare(b, 'es'));
  if (k === 'semanas') return ord.length === 1 ? `Semana ${ord[0]}` : ord.length <= 4 ? `Semanas ${ord.join(', ')}` : `${ord.length} semanas`;
  if (k === 'nucleos') return ord.length === 1 ? `Núcleo ${ord[0]}` : `Núcleos ${ord.join(', ')}`;
  if (k === 'equipos') return ord.join(' y ');
  return ord.length === 1 ? ord[0] : ord.length === 2 ? ord.map(a => a.split(' ')[0]).join(' y ') : `${ord.length} asesoras`;
}
dash.draw('fecha_label', el => { el.textContent = etiquetaFecha(dash.params()); });
dash.draw('ms_label', el => { const k = el.dataset.param; el.textContent = etiquetaLista(k, lista(dash.params()[k])); });
dash.draw('activos', el => {
  const p = dash.params(), partes = [];
  const sem = lista(p.semanas).map(Number).sort((a, b) => a - b);
  if (sem.length) partes.push(sem.length === 1 ? `semana ${sem[0]} (${fCorto(inicioSemana(sem[0]))} – ${fCorto(addDays(inicioSemana(sem[0]), 6))})` : `semanas ${sem.join(', ')}`);
  else partes.push(p.desde || p.hasta ? etiquetaFecha(p) : 'todo el periodo');
  const nuc = lista(p.nucleos); if (nuc.length) partes.push(etiquetaLista('nucleos', nuc.map(Number)).toLowerCase());
  const eq = lista(p.equipos); partes.push(eq.length ? eq.join(' y ') : 'todos los equipos');
  const as = lista(p.asesoras); partes.push(as.length ? (as.length <= 3 ? as.join(', ') : `${as.length} asesoras`) : 'todas las asesoras');
  el.textContent = partes.join(' · ');
});
function opcion(valor, texto, nota, marcado) {
  const lab = document.createElement('label'); lab.className = 'op';
  const inp = document.createElement('input'); inp.type = 'checkbox'; inp.value = valor; inp.checked = marcado;
  lab.appendChild(inp); lab.appendChild(document.createTextNode(texto));
  if (nota) { const s = document.createElement('small'); s.textContent = nota; lab.appendChild(s); }
  return lab;
}
function aplicar(k, cont) {
  const vals = [...cont.querySelectorAll('input:checked')].map(i => i.value);
  const v = vals.length ? ((k === 'semanas' || k === 'nucleos') ? vals.map(Number) : vals) : null;
  const upd = {[k]: v};
  if (k === 'semanas' && v) { upd.desde = null; upd.hasta = null; calInicio = null; }
  if (k === 'equipos') {
    const g = dash.data('llamadas'); const as = lista(dash.params().asesoras);
    if (v && as.length && g.status === 'ok') { const eqDe = new Map(g.data.map(r => [r.asesora, r.equipo])); const quedan = as.filter(a => v.includes(eqDe.get(a))); upd.asesoras = quedan.length ? quedan : null; }
  }
  dash.setParams(upd);
}
dash.draw('ms_semanas', cont => {
  const g = dash.data('llamadas'); const sel = lista(dash.params().semanas);
  cont.replaceChildren();
  if (g.status !== 'ok') { cont.textContent = '—'; return; }
  const [a, b] = rango(g.data);
  if (a) for (let s = semanaDe(a); s <= semanaDe(b); s++) cont.appendChild(opcion(String(s), `Semana ${s}`, `${fCorto(inicioSemana(s))} – ${fCorto(addDays(inicioSemana(s), 6))}`, sel.includes(String(s))));
  cont.onchange = () => aplicar('semanas', cont);
});
dash.draw('ms_nucleos', cont => {
  const g = dash.data('llamadas'); const sel = lista(dash.params().nucleos);
  cont.replaceChildren();
  if (g.status !== 'ok') { cont.textContent = '—'; return; }
  const [a, b] = rango(g.data);
  if (a) for (let n = nucleoDe(a); n <= nucleoDe(b); n++) cont.appendChild(opcion(String(n), `Núcleo ${n}`, `${fCorto(inicioNucleo(n))} – ${fCorto(finNucleo(n))}`, sel.includes(String(n))));
  cont.onchange = () => aplicar('nucleos', cont);
});
dash.draw('ms_asesoras', cont => {
  const g = dash.data('llamadas'); const p = dash.params(); const sel = lista(p.asesoras), eq = lista(p.equipos);
  cont.replaceChildren();
  if (g.status !== 'ok') { cont.textContent = '—'; return; }
  const m = new Map(); for (const r of g.data) m.set(r.asesora, r.equipo);
  [...m].filter(([a, e]) => !eq.length || eq.includes(e)).sort((x, y) => x[0].localeCompare(y[0], 'es'))
    .forEach(([a, e]) => cont.appendChild(opcion(a, a, e, sel.includes(a))));
  cont.onchange = () => aplicar('asesoras', cont);
});
document.querySelectorAll('#lista-equipos').forEach(cont => cont.addEventListener('change', () => aplicar('equipos', cont)));
dash.onData(() => {
  const eq = lista(dash.params().equipos);
  document.querySelectorAll('#lista-equipos input').forEach(i => { i.checked = eq.includes(i.value); });
});
document.querySelectorAll('[data-ms-limpiar]').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.msLimpiar; const upd = {[k]: null};
  dash.setParams(upd);
}));
document.querySelectorAll('#btn-limpiar').forEach(b => b.addEventListener('click', () => { calInicio = null; dash.resetParams(); }));

/* ---------- Ventanas emergentes ---------- */
let calVista = null, calInicio = null;
function cerrarTodo(excepto) {
  document.querySelectorAll('.pa .pop').forEach(p => { if (p !== excepto) p.hidden = true; });
  document.querySelectorAll('.pa .btn[aria-expanded]').forEach(b => { const p = b.parentElement.querySelector('.pop'); b.setAttribute('aria-expanded', p && !p.hidden ? 'true' : 'false'); });
}
document.querySelectorAll('.pa .ctl').forEach(ctl => {
  const btn = ctl.querySelector('.btn'), pop = ctl.querySelector('.pop');
  if (!btn || !pop) return;
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const abrir = pop.hidden; pop.hidden = !abrir; cerrarTodo(abrir ? pop : null);
    if (abrir && pop.id === 'pop-fecha') { calVista = null; dash.draw('cal'); }
  });
  pop.addEventListener('click', ev => ev.stopPropagation());
});
document.addEventListener('click', () => cerrarTodo(null));
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarTodo(null); });

/* ---------- Calendario ---------- */
function hoyLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function lunes(f) { const dow = (utc(f).getUTCDay() + 6) % 7; return addDays(f, -dow); }
document.querySelectorAll('.presets button').forEach(b => b.addEventListener('click', () => {
  const t = hoyLocal(); const [y, m] = ymd(t); let d = null, h = null;
  switch (b.dataset.preset) {
    case 'hoy': d = h = t; break;
    case 'ayer': d = h = addDays(t, -1); break;
    case 'semana': d = lunes(t); h = addDays(d, 6); break;
    case 'semana_pasada': d = addDays(lunes(t), -7); h = addDays(d, 6); break;
    case 'mes': d = iso(new Date(Date.UTC(y, m, 1))); h = iso(new Date(Date.UTC(y, m + 1, 0))); break;
    case 'mes_pasado': d = iso(new Date(Date.UTC(y, m - 1, 1))); h = iso(new Date(Date.UTC(y, m, 0))); break;
    default: d = h = null;
  }
  calInicio = null;
  dash.setParams({desde: d, hasta: h, semanas: null});
  cerrarTodo(null);
}));
dash.draw('cal', el => {
  const g = dash.data('llamadas'); const p = dash.params();
  if (g.status !== 'ok') { el.replaceChildren(); el.textContent = g.status === 'error' ? 'No se pudieron cargar las fechas.' : '—'; return; }
  const [min, max] = rango(g.data);
  if (!calVista) { const base = p.hasta || max || hoyLocal(); const [y, m] = ymd(base); calVista = [y, m]; }
  const [vy, vm] = calVista;
  el.replaceChildren();
  const head = document.createElement('div'); head.className = 'mes';
  const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'nav'; prev.textContent = '‹'; prev.setAttribute('aria-label', 'Mes anterior');
  const next = document.createElement('button'); next.type = 'button'; next.className = 'nav'; next.textContent = '›'; next.setAttribute('aria-label', 'Mes siguiente');
  const tit = document.createElement('strong'); tit.textContent = `${MESES[vm]} ${vy}`;
  const primero = iso(new Date(Date.UTC(vy, vm, 1))), ultimo = iso(new Date(Date.UTC(vy, vm + 1, 0)));
  prev.disabled = !!(min && primero <= min); next.disabled = !!(max && ultimo >= max);
  prev.onclick = () => { const t = new Date(Date.UTC(vy, vm - 1, 1)); calVista = [t.getUTCFullYear(), t.getUTCMonth()]; dash.draw('cal'); };
  next.onclick = () => { const t = new Date(Date.UTC(vy, vm + 1, 1)); calVista = [t.getUTCFullYear(), t.getUTCMonth()]; dash.draw('cal'); };
  head.append(prev, tit, next); el.appendChild(head);
  const grid = document.createElement('div'); grid.className = 'grid';
  ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].forEach(t => { const s = document.createElement('span'); s.className = 'dow'; s.textContent = t; grid.appendChild(s); });
  let f = lunes(primero);
  for (let i = 0; i < 42 && (f <= ultimo || i % 7 !== 0); i++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'd'; b.textContent = String(ymd(f)[2]);
    if (ymd(f)[1] !== vm) b.classList.add('fuera');
    if ((min && f < min) || (max && f > max)) b.disabled = true;
    const d0 = calInicio || p.desde, d1 = calInicio || p.hasta;
    if (d0 && d1 && f >= d0 && f <= d1) b.classList.add('rango');
    if (f === d0 || f === d1) { b.classList.add('sel'); b.style.backgroundColor = PAL.accTxt; b.style.borderRadius = '8px'; }
    const dia = f;
    b.setAttribute('aria-label', fLargo(dia));
    b.onclick = () => {
      if (!calInicio) { calInicio = dia; dash.setParams({desde: dia, hasta: dia, semanas: null}); }
      else { const a = calInicio < dia ? calInicio : dia, z = calInicio < dia ? dia : calInicio; calInicio = null; dash.setParams({desde: a, hasta: z, semanas: null}); cerrarTodo(null); }
    };
    grid.appendChild(b);
    f = addDays(f, 1);
  }
  el.appendChild(grid);
});

/* ---------- Pestañas ---------- */
const TABS = ['salientes', 'no-conectadas', 'entrantes', 'por-hora', 'rellamadas'];
let tabActual = TABS.includes((location.hash || '').slice(1)) ? location.hash.slice(1) : 'salientes';
function mostrar(id) {
  tabActual = id;
  document.querySelectorAll('section.tab').forEach(s => { s.hidden = s.id !== id; });
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
  dash.setLink(id);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => mostrar(b.dataset.tab)));
mostrar(tabActual);
window.addEventListener('beforeprint', () => document.querySelectorAll('section.tab').forEach(s => { s.hidden = false; }));
window.addEventListener('afterprint', () => mostrar(tabActual));

/* ---------- Orden de tablas ---------- */
const orden = {};
document.querySelectorAll('.pa table').forEach(tabla => {
  const tb = tabla.querySelector('tbody[data-draw]'); if (!tb) return;
  const nombre = tb.dataset.draw;
  tabla.querySelectorAll('th[aria-sort]').forEach(th => {
    const ordenar = () => {
      const k = th.dataset.field, texto = ['asesora', 'equipo', 'hora', 'intento'].includes(k);
      const actual = orden[nombre];
      const dir = actual && actual.k === k ? (actual.dir === 'desc' ? 'asc' : 'desc') : (texto ? 'asc' : 'desc');
      orden[nombre] = {k, dir};
      tabla.querySelectorAll('th[aria-sort]').forEach(o => o.setAttribute('aria-sort', o === th ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'));
      dash.draw(nombre);
    };
    th.addEventListener('click', ordenar);
    th.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ordenar(); } });
  });
});
function cuerpo(tb, id, cols) {
  const g = dash.data(id);
  tb.replaceChildren();
  if (g.status !== 'ok') return;
  let filas = g.data.slice();
  const o = orden[tb.dataset.draw];
  if (o) filas.sort((a, b) => {
    const x = a[o.k], y = b[o.k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', {numeric: true});
    return o.dir === 'desc' ? -c : c;
  });
  filas.forEach(r => {
    const tr = document.createElement('tr');
    cols.forEach(([k, f, cls]) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = r[k] == null ? '—' : f(r[k]); tr.appendChild(td); });
    tb.appendChild(tr);
  });
}
const S = String;
dash.draw('t_equipos', tb => cuerpo(tb, 'equipos_s', [['equipo', S], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_asesoras', tb => cuerpo(tb, 'asesoras_s', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_nc', tb => cuerpo(tb, 'nc_asesora', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['no_conectadas', n0], ['pct_no', pc], ['sin_contestar', n0], ['no_disponible', n0], ['buzon', n0], ['solo_lp', n0], ['otras', n0]]));
dash.draw('t_entrantes', tb => cuerpo(tb, 'asesoras_e', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_efec', pc]]));
dash.draw('t_horas', tb => cuerpo(tb, 'horas_s', [['hora', S], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_intentos', tb => cuerpo(tb, 'intentos_s', [['intento', S], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc], ['primer_contacto', n0]]));

/* ---------- Utilidades de gráficos ---------- */
function filasDe(id, el) {
  const g = dash.data(id);
  if (g.status === 'ok') {
    if (!g.data.length) { el.replaceChildren(); const d = document.createElement('div'); d.className = 'vacio'; d.textContent = 'Sin llamadas para estos filtros.'; el.appendChild(d); return null; }
    return g.data;
  }
  el.replaceChildren(); el.textContent = g.status === 'error' ? 'No se pudo cargar esta sección.' : '—';
  return null;
}
function mkTip(root) {
  const t = document.createElement('div'); t.className = 'tip'; root.appendChild(t);
  return {
    show(lines, ev) { const p = d3.pointer(ev, root); t.replaceChildren(); lines.forEach((l, i) => { const s = document.createElement('div'); s.textContent = l; if (i === 0) s.style.fontWeight = '600'; t.appendChild(s); });
      t.style.opacity = 1; const w = root.clientWidth, tw = t.offsetWidth; t.style.left = Math.max(0, Math.min(p[0] - tw / 2, w - tw)) + 'px'; t.style.top = Math.max(0, p[1] - t.offsetHeight - 10) + 'px'; },
    hide() { t.style.opacity = 0; }
  };
}
function leyenda(el, items) {
  const lg = document.createElement('div'); lg.className = 'legend';
  items.forEach(l => { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = l.color; s.appendChild(i); s.appendChild(document.createTextNode(l.name)); lg.appendChild(s); });
  el.appendChild(lg);
}
function medirTexto(svg, txt, size) { const t = svg.append('text').style('font-size', size + 'px').text(txt); const w = t.node().getComputedTextLength() || txt.length * size * 0.6; t.remove(); return w; }
function hbars(el, items, o) {
  el.replaceChildren();
  if (o.legend) leyenda(el, o.legend);
  const w = Math.max(el.clientWidth, 260), bh = 22, gap = 12;
  const svg = d3.select(el).append('svg').attr('width', '100%').style('display', 'block').attr('role', 'img').attr('aria-label', o.aria);
  const lwN = Math.max(...items.map(d => medirTexto(svg, d.label, 12))) + 12;
  const vwN = Math.max(...items.map(d => medirTexto(svg, d.text, 12))) + 12;
  const apilado = lwN + vwN + 140 > w;
  const lw = apilado ? 0 : lwN, vw = apilado ? 0 : vwN, fila = apilado ? bh + 18 + gap : bh + gap;
  const h = items.length * fila - gap;
  svg.attr('viewBox', `0 0 ${w} ${h}`);
  const bw = Math.max(40, w - lw - vw);
  const max = d3.max(items, d => d3.sum(d.seg, s => s.v)) || 1;
  const tip = mkTip(el);
  items.forEach((d, i) => {
    const y0 = i * fila, y = apilado ? y0 + 18 : y0;
    if (apilado) {
      svg.append('text').attr('x', 0).attr('y', y0 + 11).style('fill', 'var(--color-fg-muted)').style('font-size', '12px').text(d.label);
      svg.append('text').attr('x', w).attr('y', y0 + 11).attr('text-anchor', 'end').style('fill', 'var(--color-fg)').style('font-size', '12px').style('font-variant-numeric', 'tabular-nums').text(d.text);
    } else {
      svg.append('text').attr('x', lw - 10).attr('y', y + bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--color-fg-muted)').style('font-size', '12px').text(d.label);
    }
    let x = lw;
    d.seg.forEach(s => {
      const sw = s.v / max * bw; if (sw <= 0) return;
      svg.append('rect').attr('x', x).attr('y', y).attr('width', sw).attr('height', bh).attr('rx', 3).style('fill', s.color)
        .on('mousemove', ev => tip.show([d.label, ...(d.tip || [`${s.name ? s.name + ': ' : ''}${n0(s.v)}`])], ev)).on('mouseleave', () => tip.hide());
      x += sw;
    });
    if (!apilado) svg.append('text').attr('x', x + 8).attr('y', y + bh / 2).attr('dy', '0.35em').style('fill', 'var(--color-fg)').style('font-size', '12px').style('font-variant-numeric', 'tabular-nums').text(d.text);
  });
}
function vbars(el, items, o) {
  el.replaceChildren();
  const w = Math.max(el.clientWidth, 260), h = 240, m = {t: 22, b: o.sub ? 46 : 28, l: 4, r: 4};
  const x = d3.scaleBand().domain(items.map(d => d.label)).range([m.l, w - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([0, (d3.max(items, d => d.v) || 1) * 1.12]).range([h - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', o.aria);
  const tip = mkTip(el);
  svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', h - m.b).attr('y2', h - m.b).style('stroke', 'var(--cds-chart-axis)');
  const bw = x.bandwidth(), fs = bw < 30 ? 10 : 11;
  items.forEach(d => {
    const bx = x(d.label);
    svg.append('rect').attr('x', bx).attr('y', y(d.v)).attr('width', bw).attr('height', Math.max(0, h - m.b - y(d.v))).attr('rx', 3).style('fill', d.color)
      .on('mousemove', ev => tip.show(d.tip, ev)).on('mouseleave', () => tip.hide());
    svg.append('text').attr('x', bx + bw / 2).attr('y', y(d.v) - 6).attr('text-anchor', 'middle').style('fill', 'var(--color-fg)').style('font-size', fs + 'px').style('font-variant-numeric', 'tabular-nums').text(d.text);
    svg.append('text').attr('x', bx + bw / 2).attr('y', h - m.b + 16).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', fs + 'px').text(d.short || d.label);
    if (d.sub != null) svg.append('text').attr('x', bx + bw / 2).attr('y', h - m.b + 31).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', '10px').style('font-variant-numeric', 'tabular-nums').text(d.sub);
  });
}
function ejeY(svg, y, ticks, fmt, m, w) {
  ticks.forEach(t => {
    svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(t)).attr('y2', y(t)).style('stroke', 'var(--cds-chart-grid)');
    svg.append('text').attr('x', m.l - 6).attr('y', y(t)).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--cds-text-secondary)').style('font-size', '11px').style('font-variant-numeric', 'tabular-nums').text(fmt(t));
  });
}
function ejeX(svg, x, dom, m, h, w) {
  const paso = Math.max(1, Math.ceil(dom.length / Math.max(1, Math.floor((w - m.l - m.r) / 52))));
  dom.forEach((f, i) => { if (i % paso) return; svg.append('text').attr('x', x(f) + x.bandwidth() / 2).attr('y', h - m.b + 16).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', '11px').text(fCorto(f)); });
}

/* ---------- Gráficos: Salientes ---------- */
dash.draw('ch_diario', el => {
  const rows = filasDe('diario_s', el); if (!rows) return;
  el.replaceChildren();
  const A = PAL.acc;
  leyenda(el, [{name: 'Llamadas', color: MUT}, {name: 'Efectivas', color: A}]);
  const w = Math.max(el.clientWidth, 280), h = 230;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', 'Llamadas y efectivas por día');
  const y = d3.scaleLinear().domain([0, d3.max(rows, r => r.llamadas) || 1]).nice(4);
  const ticks = y.ticks(4);
  const m = {t: 8, r: 6, b: 26, l: medirTexto(svg, n0(ticks[ticks.length - 1]), 11) + 12};
  y.range([h - m.b, m.t]);
  const dom = rows.map(r => r.fecha);
  const x = d3.scaleBand().domain(dom).range([m.l, w - m.r]).padding(0.18);
  ejeY(svg, y, ticks, n0, m, w);
  const tip = mkTip(el);
  rows.forEach(r => {
    const bx = x(r.fecha), bw = x.bandwidth();
    svg.append('rect').attr('x', bx).attr('y', y(r.llamadas)).attr('width', bw).attr('height', Math.max(0, h - m.b - y(r.llamadas))).attr('rx', 2).style('fill', MUT);
    svg.append('rect').attr('x', bx).attr('y', y(r.efectivas)).attr('width', bw).attr('height', Math.max(0, h - m.b - y(r.efectivas))).attr('rx', 2).style('fill', A);
    svg.append('rect').attr('x', bx).attr('y', m.t).attr('width', bw).attr('height', h - m.b - m.t).style('fill', 'transparent')
      .on('mousemove', ev => tip.show([fLargo(r.fecha), `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas`, `${n0(r.efectivas)} efectivas`], ev)).on('mouseleave', () => tip.hide());
  });
  ejeX(svg, x, dom, m, h, w);
});
dash.draw('ch_tasas', el => {
  const rows = filasDe('diario_s', el); if (!rows) return;
  el.replaceChildren();
  const A = PAL.acc, B = PAL.acc2;
  leyenda(el, [{name: '% conectadas', color: B}, {name: '% efectivas sobre conectadas', color: A}]);
  const w = Math.max(el.clientWidth, 280), h = 230;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', 'Porcentaje de conectadas y de efectivas por día');
  const vmax = d3.max(rows, r => Math.max(r.pct_conect || 0, r.pct_efec || 0)) || 0.1;
  const y = d3.scaleLinear().domain([0, vmax]).nice(4);
  const ticks = y.ticks(4);
  const m = {t: 8, r: 10, b: 26, l: medirTexto(svg, pc0(ticks[ticks.length - 1]), 11) + 12};
  y.range([h - m.b, m.t]);
  const dom = rows.map(r => r.fecha);
  const x = d3.scaleBand().domain(dom).range([m.l, w - m.r]).padding(0.18);
  ejeY(svg, y, ticks, pc0, m, w);
  const cx = f => x(f) + x.bandwidth() / 2;
  [['pct_conect', B], ['pct_efec', A]].forEach(([k, c]) => {
    const pts = rows.filter(r => r[k] != null);
    svg.append('path').attr('d', d3.line().x(r => cx(r.fecha)).y(r => y(r[k]))(pts)).style('fill', 'none').style('stroke', c).style('stroke-width', 2);
    pts.forEach(r => svg.append('circle').attr('cx', cx(r.fecha)).attr('cy', y(r[k])).attr('r', rows.length > 20 ? 2 : 3).style('fill', c));
  });
  const tip = mkTip(el);
  rows.forEach(r => svg.append('rect').attr('x', x(r.fecha)).attr('y', m.t).attr('width', x.bandwidth()).attr('height', h - m.b - m.t).style('fill', 'transparent')
    .on('mousemove', ev => tip.show([fLargo(r.fecha), `Conectadas: ${pc(r.pct_conect)}`, `Efectivas sobre conectadas: ${pc(r.pct_efec)}`], ev)).on('mouseleave', () => tip.hide()));
  ejeX(svg, x, dom, m, h, w);
});
dash.draw('ch_asesoras', el => {
  const rows = filasDe('asesoras_s', el); if (!rows) return;
  const A = PAL.acc;
  hbars(el, rows.slice().sort((a, b) => b.conectadas - a.conectadas).map(r => ({
    label: r.asesora, seg: [{v: r.efectivas, color: A, name: 'Efectivas'}, {v: r.conectadas - r.efectivas, color: MUT, name: 'Conectadas no efectivas'}],
    text: `${n0(r.conectadas)} · ${pc(r.pct_efec)} efectivas`,
    tip: [`${r.equipo}`, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas (${pc(r.pct_conect)})`, `${n0(r.efectivas)} efectivas (${pc(r.pct_efec)})`]
  })), {aria: 'Conectadas y efectivas por asesora', legend: [{name: 'Efectivas', color: A}, {name: 'Resto de las conectadas', color: MUT}]});
});

/* ---------- Gráficos: No conectadas y Entrantes ---------- */
dash.draw('ch_nc', el => {
  const rows = filasDe('nc_tip', el); if (!rows) return;
  const A = PAL.acc;
  hbars(el, rows.map((r, i) => ({label: tl(r.tipificacion), seg: [{v: r.llamadas, color: i === 0 ? A : MUT, name: ''}], text: `${n0(r.llamadas)} · ${pc(r.pct)}`, tip: [`${n0(r.llamadas)} llamadas`, `${pc(r.pct)} de las no conectadas`]})),
    {aria: 'No conectadas por tipificación'});
});
dash.draw('ch_entrantes', el => {
  const rows = filasDe('asesoras_e', el); if (!rows) return;
  const A = PAL.acc;
  hbars(el, rows.map(r => ({label: r.asesora, seg: [{v: r.efectivas, color: A, name: 'Efectivas'}, {v: r.conectadas - r.efectivas, color: MUT, name: 'Conectadas no efectivas'}],
    text: `${n0(r.llamadas)} entrantes`, tip: [`${r.equipo}`, `${n0(r.conectadas)} conectadas`, `${n0(r.efectivas)} efectivas`]})),
    {aria: 'Entrantes por asesora', legend: [{name: 'Efectivas', color: A}, {name: 'Resto de las conectadas', color: MUT}]});
});

/* ---------- Gráficos: Por hora y Rellamadas ---------- */
dash.draw('ch_hora_cont', el => {
  const rows = filasDe('horas_s', el); if (!rows) return;
  const A = PAL.acc, tot = rows.reduce((s, r) => s + r.llamadas, 0);
  const elegibles = rows.filter(r => r.llamadas >= tot * 0.05);
  const mejor = elegibles.length ? d3.greatest(elegibles, r => r.pct_conect) : null;
  vbars(el, rows.map(r => ({label: r.hora, short: r.hora.slice(0, 2), sub: n0(r.llamadas), v: r.pct_conect || 0, text: pc0(r.pct_conect), color: r === mejor ? A : MUT,
    tip: [r.hora, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas (${pc(r.pct_conect)})`, `${n0(r.efectivas)} efectivas`]})), {sub: true, aria: 'Porcentaje de conectadas por hora'});
});
dash.draw('ch_hora_efec', el => {
  const rows = filasDe('horas_s', el); if (!rows) return;
  const A = PAL.acc;
  vbars(el, rows.map(r => ({label: r.hora, short: r.hora.slice(0, 2), v: r.efectivas, text: n0(r.efectivas), color: A,
    tip: [r.hora, `${n0(r.efectivas)} efectivas`, `${pc(r.pct_efec)} de las conectadas`]})), {aria: 'Llamadas efectivas por hora'});
});
dash.draw('ch_hora_conect_tot', el => {
  const rows = filasDe('horas_s', el); if (!rows) return;
  const B = PAL.acc2;
  vbars(el, rows.map(r => ({label: r.hora, short: r.hora.slice(0, 2), v: r.conectadas, text: n0(r.conectadas), color: B,
    tip: [r.hora, `${n0(r.conectadas)} conectadas`, `de ${n0(r.llamadas)} llamadas`]})), {aria: 'Llamadas conectadas por hora'});
});
dash.draw('ch_hora_efec_pct', el => {
  const rows = filasDe('horas_s', el); if (!rows) return;
  const A = PAL.acc, tot = rows.reduce((s, r) => s + r.conectadas, 0);
  const elegibles = rows.filter(r => r.conectadas >= tot * 0.05);
  const mejor = elegibles.length ? d3.greatest(elegibles, r => r.pct_efec) : null;
  vbars(el, rows.map(r => ({label: r.hora, short: r.hora.slice(0, 2), sub: n0(r.conectadas), v: r.pct_efec || 0, text: pc0(r.pct_efec), color: r === mejor ? A : MUT,
    tip: [r.hora, `${n0(r.efectivas)} efectivas de ${n0(r.conectadas)} conectadas (${pc(r.pct_efec)})`, `${pc(r.efec_llamadas)} del total de llamadas`]})), {sub: true, aria: 'Porcentaje de efectivas por hora'});
});
dash.draw('ch_intentos', el => {
  const rows = filasDe('intentos_s', el); if (!rows) return;
  const A = PAL.acc;
  vbars(el, rows.map((r, i) => ({label: r.intento, short: i === 4 ? '5.º +' : r.intento.split(' ')[0], sub: n0(r.llamadas), v: r.pct_conect || 0, text: pc0(r.pct_conect), color: i === 0 ? A : MUT,
    tip: [r.intento, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas (${pc(r.pct_conect)})`]})), {sub: true, aria: 'Porcentaje de conectadas por intento'});
});
dash.draw('ch_primer', el => {
  const rows = filasDe('intentos_s', el); if (!rows) return;
  const A = PAL.acc;
  vbars(el, rows.map((r, i) => ({label: r.intento, short: i === 4 ? '5.º +' : r.intento.split(' ')[0], v: r.primer_contacto, text: n0(r.primer_contacto), color: A,
    tip: [r.intento, `${n0(r.primer_contacto)} primeros contactos`]})), {aria: 'Primer contacto logrado por intento'});
});
