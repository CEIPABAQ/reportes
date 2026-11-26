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
const nf1 = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 1});
const n1 = v => (v == null || !isFinite(v)) ? '—' : nf1.format(v);
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
dash.calc('franja_asesoras', {
  inputs: ['filtro'], title: 'Mejor franja por asesora',
  description: 'Para cada asesora: la hora con más conectadas y la hora con mejor porcentaje de efectivas (solo horas con al menos 10 conectadas y el 5 % de sus conectadas).',
  fn: (filtro) => [...agrupar(filtro.filter(r => r.direccion === 'Saliente'), 'asesora')].map(([a, rs]) => {
    const total = medir(rs);
    const horas = [...agrupar(rs, 'hora')].map(([h, hs]) => ({hora: String(h).padStart(2, '0') + ':00', ...medir(hs)}));
    const masConect = horas.reduce((m, h) => (!m || h.conectadas > m.conectadas) ? h : m, null);
    const minimo = Math.max(10, total.conectadas * 0.05);
    const elegibles = horas.filter(h => h.conectadas >= minimo && h.pct_efec != null);
    const mejorEfec = elegibles.reduce((m, h) => (!m || h.pct_efec > m.pct_efec) ? h : m, null);
    return {asesora: a, equipo: rs[0].equipo,
      hora_conect: masConect && masConect.conectadas > 0 ? masConect.hora : null, conectadas_hora: masConect ? masConect.conectadas : null,
      hora_efec: mejorEfec ? mejorEfec.hora : null, pct_efec_hora: mejorEfec ? mejorEfec.pct_efec : null, pct_efec: total.pct_efec};
  }).sort((x, y) => (y.conectadas_hora || 0) - (x.conectadas_hora || 0))
});
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const diaDe = f => (utc(f).getUTCDay() + 6) % 7;
dash.calc('evol_s', {
  inputs: ['llamadas'], title: 'Salientes por día y asesora',
  description: 'Llamadas, conectadas y efectivas de cada asesora por día, con los filtros de fecha, semanas y núcleos; las asesoras se eligen dentro de la pestaña Rendimiento.',
  fn: (llamadas) => {
    const p = dash.params(); const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number);
    const m = new Map();
    for (const r of llamadas) {
      if (r.direccion !== 'Saliente') continue;
      if ((p.desde && r.fecha < p.desde) || (p.hasta && r.fecha > p.hasta)) continue;
      if (sem.length && !sem.includes(semanaDe(r.fecha))) continue;
      if (nuc.length && !nuc.includes(nucleoDe(r.fecha))) continue;
      const k = r.fecha + '|' + r.asesora;
      if (!m.has(k)) m.set(k, {fecha: r.fecha, asesora: r.asesora, equipo: r.equipo, llamadas: 0, conectadas: 0, efectivas: 0});
      const o = m.get(k); o.llamadas += r.llamadas; if (r.clase !== 'No contestada') o.conectadas += r.llamadas; if (r.clase === 'Efectiva') o.efectivas += r.llamadas;
    }
    return [...m.values()].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.asesora.localeCompare(b.asesora, 'es'));
  }
});
dash.calc('mapa_s', {
  inputs: ['filtro'], title: 'Salientes por día de la semana y hora', description: 'Indicadores de salientes para cada combinación de día de la semana y hora.',
  fn: (filtro) => {
    const m = new Map();
    for (const r of filtro) { if (r.direccion !== 'Saliente') continue; const k = diaDe(r.fecha) * 100 + r.hora; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m].sort((a, b) => a[0] - b[0]).map(([k, rs]) => ({dia: DIAS[Math.floor(k / 100)], dia_n: Math.floor(k / 100), hora: String(k % 100).padStart(2, '0') + ':00', hora_n: k % 100, ...medir(rs)}));
  }
});
dash.calc('mapa_mejor', {
  inputs: ['mapa_s'], title: 'Mejor día y hora', description: 'Combinación de día y hora con mayor % de conectadas y con mayor % de efectividad total, entre las que tienen al menos 30 llamadas y el 1 % del total.',
  fn: (mapa_s) => {
    const tot = mapa_s.reduce((s, c) => s + c.llamadas, 0), min = Math.max(30, tot * 0.01);
    const el = mapa_s.filter(c => c.llamadas >= min);
    const mejor = k => el.filter(c => c[k] != null).sort((a, b) => b[k] - a[k])[0];
    const a = mejor('pct_conect'), b = mejor('efec_llamadas');
    return [{celda_conect: a ? `${a.dia.toLowerCase()} a las ${a.hora}` : null, pct_conect: a ? a.pct_conect : null,
      celda_efec: b ? `${b.dia.toLowerCase()} a las ${b.hora}` : null, efec_llamadas: b ? b.efec_llamadas : null}];
  }
});
dash.calc('base_cmp', {
  inputs: ['llamadas'], title: 'Salientes para comparar semanas',
  description: 'Salientes con los filtros de núcleos, equipos y asesoras. Los de fecha y semanas no se aplican: las semanas se eligen en la pestaña Semana a semana.',
  fn: (llamadas) => {
    const p = dash.params(); const nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return llamadas.filter(r => r.direccion === 'Saliente' && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) && (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.asesora)))
      .map(r => Object.assign({}, r, {sem: semanaDe(r.fecha)}));
  }
});
function semanasElegidas(rows) {
  const p = dash.params();
  const sems = [...new Set(rows.map(r => r.sem))].sort((a, b) => a - b);
  if (!sems.length) return {a: null, b: null, sems, maxF: ''};
  const maxF = rows.reduce((m, r) => r.fecha > m ? r.fecha : m, '');
  const completas = sems.filter(s => addDays(inicioSemana(s), 6) <= maxF);
  const defA = completas.length ? completas[completas.length - 1] : sems[sems.length - 1];
  const a = p.cmp_a != null && sems.includes(+p.cmp_a) ? +p.cmp_a : defA;
  const antes = sems.filter(s => s < a);
  const b = p.cmp_b != null && sems.includes(+p.cmp_b) ? +p.cmp_b : (antes.length ? antes[antes.length - 1] : a);
  return {a, b, sems, maxF};
}
const enCursoSem = (s, maxF) => addDays(inicioSemana(s), 6) > maxF;
const nombreSemana = (s, maxF) => `semana ${s} (${fCorto(inicioSemana(s))} – ${fCorto(addDays(inicioSemana(s), 6))}${enCursoSem(s, maxF) ? ', en curso' : ''})`;
function comparar(A, B, sinVolumen) {
  const o = {};
  for (const k of ['llamadas', 'conectadas', 'efectivas']) { o[k + '_a'] = A[k]; o[k + '_b'] = B[k]; o['cambio_' + k] = B[k] && !sinVolumen ? A[k] / B[k] - 1 : null; }
  for (const k of ['pct_conect', 'pct_efec', 'efec_llamadas']) { o[k + '_a'] = A[k]; o[k + '_b'] = B[k]; o['cambio_' + k] = A[k] != null && B[k] != null ? A[k] - B[k] : null; }
  return o;
}
dash.calc('cmp_kpi', {
  inputs: ['base_cmp'], title: 'Comparación de dos semanas', description: 'Totales de la semana actual y de la comparada, con su cambio.',
  fn: (base_cmp) => {
    const {a, b, maxF} = semanasElegidas(base_cmp); if (a == null) return [];
    const sin = enCursoSem(a, maxF) || enCursoSem(b, maxF);
    return [{sem_a: nombreSemana(a, maxF), sem_b: nombreSemana(b, maxF), ...comparar(medir(base_cmp.filter(r => r.sem === a)), medir(base_cmp.filter(r => r.sem === b)), sin)}];
  }
});
dash.calc('cmp_equipos', {
  inputs: ['base_cmp'], title: 'Comparación de semanas por equipo', description: 'Semana actual frente a la comparada, por equipo.',
  fn: (base_cmp) => {
    const {a, b, maxF} = semanasElegidas(base_cmp); if (a == null) return [];
    const sin = enCursoSem(a, maxF) || enCursoSem(b, maxF);
    return ['Posgrados', 'Pregrados'].map(e => ({equipo: e, ...comparar(medir(base_cmp.filter(r => r.sem === a && r.equipo === e)), medir(base_cmp.filter(r => r.sem === b && r.equipo === e)), sin)})).filter(r => r.llamadas_a || r.llamadas_b);
  }
});
dash.calc('cmp_asesoras', {
  inputs: ['base_cmp'], title: 'Comparación de semanas por asesora', description: 'Semana actual frente a la comparada, por asesora.',
  fn: (base_cmp) => {
    const {a, b, maxF} = semanasElegidas(base_cmp); if (a == null) return [];
    const sin = enCursoSem(a, maxF) || enCursoSem(b, maxF);
    return [...agrupar(base_cmp.filter(r => r.sem === a || r.sem === b), 'asesora')].map(([as, rs]) => ({asesora: as, equipo: rs[0].equipo, ...comparar(medir(rs.filter(r => r.sem === a)), medir(rs.filter(r => r.sem === b)), sin)})).sort((x, y) => y.llamadas_a - x.llamadas_a);
  }
});
dash.calc('semanas_s', {
  inputs: ['base_cmp'], title: 'Salientes por semana', description: 'Indicadores por semana (lunes a domingo; la semana 1 empieza el 12 de octubre) y cambio frente a la semana anterior.',
  fn: (base_cmp) => {
    const s = base_cmp;
    const maxF = s.reduce((m, r) => r.fecha > m ? r.fecha : m, '');
    const rows = [...agrupar(s.map(r => Object.assign({}, r, {sem: semanaDe(r.fecha)})), 'sem')].sort((a, b) => a[0] - b[0]).map(([k, rs]) => {
      const ini = inicioSemana(k), fin = addDays(ini, 6);
      return {n: k, semana: `Semana ${k}`, fechas: `${fCorto(ini)} – ${fCorto(fin)}${fin > maxF ? ' (en curso)' : ''}`, enCurso: fin > maxF, ...medir(rs)};
    });
    const porN = new Map(rows.map(r => [r.n, r]));
    return rows.map(r => {
      const p = porN.get(r.n - 1);
      const d = (k) => p && p[k] != null && r[k] != null ? r[k] - p[k] : null;
      const {n, enCurso, ...resto} = r;
      return {...resto, cambio_llamadas: p && p.llamadas && !enCurso ? r.llamadas / p.llamadas - 1 : null, cambio_pct_conect: d('pct_conect'), cambio_pct_efec: d('pct_efec')};
    });
  }
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
dash.draw('periodo', el => {
  const g = dash.data('kpi_s'); const r = g.status === 'ok' && g.data[0];
  if (!r || !r.desde) { el.textContent = 'En el periodo elegido'; return; }
  el.textContent = r.desde === r.hasta ? `El ${fLargo(r.desde)}` : `Entre el ${fLargo(r.desde)} y el ${fLargo(r.hasta)}`;
});
dash.draw('rango_datos', el => {
  const g = dash.data('llamadas');
  if (g.status !== 'ok' || !g.data.length) { el.textContent = '—'; return; }
  let a = null, b = null; for (const r of g.data) { if (!a || r.fecha < a) a = r.fecha; if (!b || r.fecha > b) b = r.fecha; }
  const y = b.slice(0, 4);
  el.textContent = a === b ? `del ${fLargo(a)} de ${y}` : `del ${fLargo(a)} al ${fLargo(b)} de ${y}`;
});
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
    if (abrir && pop.querySelector('.cal')) { calVista = null; dash.draw('cal'); }
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
const TABS = ['salientes', 'no-conectadas', 'entrantes', 'por-hora', 'mapa-calor', 'rellamadas', 'semana-a-semana', 'evolucion', 'crm'];
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
      const k = th.dataset.field, texto = ['asesora', 'equipo', 'hora', 'intento', 'hora_conect', 'hora_efec', 'semana', 'fechas', 'pipeline', 'canal', 'etapa', 'activador', 'dueno', 'tramo', 'actividad', 'grupo', 'en_aircall'].includes(k);
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
// Cada pestaña tiene su propia casilla: solo apaga o enciende el resaltado de esa pestaña
document.querySelectorAll('[data-resalte]').forEach(cb => cb.addEventListener('change', () => {
  const sec = cb.closest('section.tab'); if (sec) sec.classList.toggle('sin-resalte', !cb.checked);
}));
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
  const tabla = tb.closest('table');
  const etiquetas = tabla ? [...tabla.querySelectorAll('thead th')].map(th => th.textContent.trim()) : [];
  // Promedio de lo que se ve: media simple de cada columna numérica
  const prom = cols.map(([k]) => { const vs = filas.map(r => r[k]).filter(v => typeof v === 'number' && isFinite(v)); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; });
  const conProm = filas.length > 1;
  filas.forEach(r => {
    const tr = document.createElement('tr');
    cols.forEach(([k, f, cls], i) => {
      const td = document.createElement('td'); const c = typeof cls === 'function' ? cls(r[k]) : cls; if (c) td.className = c;
      if (etiquetas[i]) td.dataset.label = etiquetas[i];
      const num = document.createElement('span'); num.className = 'num'; num.textContent = r[k] == null ? '—' : f(r[k]); td.appendChild(num);
      if (conProm && typeof r[k] === 'number' && prom[i] != null && r[k] < prom[i] - 1e-9) td.classList.add('bajo');
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  if (conProm) {
    const tr = document.createElement('tr'); tr.className = 'prom';
    cols.forEach(([k, f, cls], i) => {
      const td = document.createElement('td'); if (etiquetas[i]) td.dataset.label = etiquetas[i];
      if (i === 0) td.textContent = 'Promedio';
      else if (prom[i] == null) { td.textContent = ''; }
      else { td.textContent = f === n0 ? nf1.format(prom[i]) : f(prom[i]); const c = typeof cls === 'function' ? cls(prom[i]) : ''; if (c) td.className = c; }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }
}
const S = String;
dash.draw('t_equipos', tb => cuerpo(tb, 'equipos_s', [['equipo', S], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_asesoras', tb => cuerpo(tb, 'asesoras_s', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_nc', tb => cuerpo(tb, 'nc_asesora', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['no_conectadas', n0], ['pct_no', pc], ['sin_contestar', n0], ['no_disponible', n0], ['buzon', n0], ['solo_lp', n0], ['otras', n0]]));
dash.draw('t_entrantes', tb => cuerpo(tb, 'asesoras_e', [['asesora', S], ['equipo', S, 'eq'], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_efec', pc]]));
dash.draw('t_horas', tb => cuerpo(tb, 'horas_s', [['hora', S], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc]]));
dash.draw('t_franja', tb => cuerpo(tb, 'franja_asesoras', [['asesora', S], ['equipo', S, 'eq'], ['hora_conect', S], ['conectadas_hora', n0], ['hora_efec', S], ['pct_efec_hora', pc], ['pct_efec', pc]]));
const flecha = v => v > 0 ? '▲ +' : v < 0 ? '▼ −' : '';
const cambioPct = v => flecha(v) + (Math.abs(v) * 100).toFixed(1).replace('.', ',') + ' %';
const cambioPts = v => flecha(v) + (Math.abs(v) * 100).toFixed(1).replace('.', ',') + ' pts';
const claseCambio = v => v == null ? '' : v > 0 ? 'sube' : v < 0 ? 'baja' : '';
dash.draw('t_semanas', tb => cuerpo(tb, 'semanas_s', [['semana', S], ['fechas', S, 'eq'], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc], ['efec_llamadas', pc], ['cambio_llamadas', cambioPct, claseCambio], ['cambio_pct_conect', cambioPts, claseCambio], ['cambio_pct_efec', cambioPts, claseCambio]]));
const COLS_CMP = [['llamadas_a', n0], ['llamadas_b', n0], ['cambio_llamadas', v => cambioPct(v), claseCambio], ['pct_conect_a', pc], ['pct_conect_b', pc], ['cambio_pct_conect', v => cambioPts(v), claseCambio], ['pct_efec_a', pc], ['pct_efec_b', pc], ['cambio_pct_efec', v => cambioPts(v), claseCambio]];
dash.draw('t_cmp_equipos', tb => cuerpo(tb, 'cmp_equipos', [['equipo', S], ...COLS_CMP]));
dash.draw('t_cmp_asesoras', tb => cuerpo(tb, 'cmp_asesoras', [['asesora', S], ['equipo', S, 'eq'], ...COLS_CMP]));
dash.draw('delta', el => {
  const g = dash.data(el.dataset.source); const r = g.status === 'ok' && Array.isArray(g.data) ? g.data[+(el.dataset.row || 0)] : null;
  const v = r ? r[el.dataset.field] : null;
  el.className = claseCambio(v);
  el.textContent = v == null ? 'sin comparar' : (el.dataset.kind === 'pts' ? cambioPts(v) : cambioPct(v));
});
function chips(cont, cual) {
  const g = dash.data('base_cmp'); cont.replaceChildren();
  if (g.status !== 'ok') { cont.textContent = '—'; return; }
  const {a, b, sems, maxF} = semanasElegidas(g.data); const sel = cual === 'a' ? a : b;
  sems.forEach(s => {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.textContent = `S${s} · ${fCorto(inicioSemana(s))}${enCursoSem(s, maxF) ? ' (en curso)' : ''}`;
    btn.setAttribute('aria-pressed', s === sel ? 'true' : 'false');
    btn.onclick = () => dash.setParams(cual === 'a' ? {cmp_a: s} : {cmp_b: s});
    cont.appendChild(btn);
  });
}
dash.draw('chips_a', cont => chips(cont, 'a'));
dash.draw('chips_b', cont => chips(cont, 'b'));
dash.draw('ch_semanal', el => {
  const rows = filasDe('semanas_s', el); if (!rows) return;
  el.replaceChildren();
  const A = PAL.acc, B = PAL.acc2;
  const gb = dash.data('base_cmp'); const sel = gb.status === 'ok' ? semanasElegidas(gb.data) : {};
  leyenda(el, [{name: '% conectadas', color: B}, {name: '% efectivas sobre conectadas', color: A}]);
  const w = Math.max(el.clientWidth, 280), h = 240;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', 'Porcentaje de conectadas y de efectivas por semana');
  const y = d3.scaleLinear().domain([0, d3.max(rows, r => Math.max(r.pct_conect || 0, r.pct_efec || 0)) || 0.1]).nice(4);
  const ticks = y.ticks(4);
  const m = {t: 16, r: 12, b: 28, l: medirTexto(svg, pc0(ticks[ticks.length - 1]), 11) + 12};
  y.range([h - m.b, m.t]);
  const dom = rows.map(r => r.semana);
  const x = d3.scaleBand().domain(dom).range([m.l, w - m.r]).padding(0.2);
  rows.forEach(r => { const n = +r.semana.split(' ')[1]; if (n === sel.a || n === sel.b) svg.append('rect').attr('x', x(r.semana)).attr('y', m.t).attr('width', x.bandwidth()).attr('height', h - m.b - m.t).attr('rx', 6).style('fill', '#efe6d4'); });
  ejeY(svg, y, ticks, pc0, m, w);
  const cx = s => x(s) + x.bandwidth() / 2;
  [['pct_conect', B], ['pct_efec', A]].forEach(([k, c]) => {
    const pts = rows.filter(r => r[k] != null);
    svg.append('path').attr('d', d3.line().x(r => cx(r.semana)).y(r => y(r[k]))(pts)).style('fill', 'none').style('stroke', c).style('stroke-width', 2);
    pts.forEach(r => { svg.append('circle').attr('cx', cx(r.semana)).attr('cy', y(r[k])).attr('r', 3.5).style('fill', c);
      svg.append('text').attr('x', cx(r.semana)).attr('y', y(r[k]) - 8).attr('text-anchor', 'middle').style('fill', 'var(--color-fg)').style('font-size', '10px').style('font-variant-numeric', 'tabular-nums').text(pc0(r[k])); });
  });
  rows.forEach(r => svg.append('text').attr('x', cx(r.semana)).attr('y', h - m.b + 17).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', '11px').text('S' + r.semana.split(' ')[1]));
  const tip = mkTip(el);
  rows.forEach(r => svg.append('rect').attr('x', x(r.semana)).attr('y', m.t).attr('width', x.bandwidth()).attr('height', h - m.b - m.t).style('fill', 'transparent')
    .on('mousemove', ev => tip.show([`${r.semana} · ${r.fechas}`, `${n0(r.llamadas)} llamadas`, `Conectadas: ${pc(r.pct_conect)}`, `Efectivas: ${pc(r.pct_efec)}`], ev)).on('mouseleave', () => tip.hide()));
});
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
let mapaMetrica = 'pct_conect';
const METRICAS = {pct_conect: {pct: true, base: 'llamadas'}, pct_efec: {pct: true, base: 'conectadas'}, efec_llamadas: {pct: true, base: 'llamadas'}, llamadas: {}, conectadas: {}, efectivas: {}};
document.querySelectorAll('#seg-mapa button').forEach(b => b.addEventListener('click', () => {
  mapaMetrica = b.dataset.m;
  document.querySelectorAll('#seg-mapa button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  dash.draw('ch_mapa');
}));
dash.draw('ch_mapa', el => {
  const rows = filasDe('mapa_s', el); if (!rows) return;
  el.replaceChildren();
  const M = METRICAS[mapaMetrica], k = mapaMetrica;
  const dias = [...new Set(rows.map(r => r.dia_n))].sort((a, b) => a - b);
  const horas = [...new Set(rows.map(r => r.hora_n))].sort((a, b) => a - b);
  const valido = r => r[k] != null && (!M.pct || r[M.base] >= 20);
  const vals = rows.filter(valido).map(r => r[k]);
  const lo = vals.length ? d3.min(vals) : 0, hi = vals.length ? d3.max(vals) : 1;
  const fmt = M.pct ? pc0 : n0;
  const ley = document.createElement('div'); ley.className = 'mapa-ley';
  const a = document.createElement('span'); a.textContent = fmt(lo); const i = document.createElement('i'); const z = document.createElement('span'); z.textContent = fmt(hi);
  ley.append(a, i, z); el.appendChild(ley);
  const wrap = document.createElement('div'); wrap.className = 'tw'; el.appendChild(wrap);
  const lw = 84, top = 24, w = Math.max(el.clientWidth, 640), cw = (w - lw) / horas.length, ch = 36, h = top + dias.length * ch;
  const svg = d3.select(wrap).append('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', 'Mapa de calor por día y hora');
  const color = d3.interpolateRgb('#f4ede0', '#46668a');
  const tip = mkTip(el);
  horas.forEach((hh, x) => svg.append('text').attr('x', lw + x * cw + cw / 2).attr('y', 14).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', '11px').text(String(hh).padStart(2, '0') + ':00'));
  const porCelda = new Map(rows.map(r => [r.dia_n * 100 + r.hora_n, r]));
  dias.forEach((d, y) => {
    svg.append('text').attr('x', 0).attr('y', top + y * ch + ch / 2).attr('dy', '0.35em').style('fill', 'var(--color-fg-muted)').style('font-size', '12px').text(DIAS[d]);
    horas.forEach((hh, x) => {
      const r = porCelda.get(d * 100 + hh);
      const ok = r && valido(r), t = ok ? (hi > lo ? (r[k] - lo) / (hi - lo) : 1) : 0;
      const cx = lw + x * cw, cy = top + y * ch;
      const rect = svg.append('rect').attr('x', cx + 1.5).attr('y', cy + 1.5).attr('width', Math.max(0, cw - 3)).attr('height', ch - 3).attr('rx', 4).style('fill', ok ? color(t) : '#f7f2e8');
      svg.append('text').attr('x', cx + cw / 2).attr('y', cy + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').style('pointer-events', 'none')
        .style('fill', ok && t > 0.55 ? '#fffdf8' : (ok ? '#2b2a33' : '#b3a995')).style('font-size', cw < 46 ? '10px' : '11px').style('font-variant-numeric', 'tabular-nums').text(ok ? fmt(r[k]) : (r ? '·' : ''));
      if (r) rect.on('mousemove', ev => tip.show([`${DIAS[d]} · ${r.hora}`, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas (${pc(r.pct_conect)})`, `${n0(r.efectivas)} efectivas (${pc(r.pct_efec)} de conectadas)`, `Efectividad total: ${pc(r.efec_llamadas)}`], ev)).on('mouseleave', () => tip.hide());
    });
  });
});
/* ---------- Rendimiento por asesora ---------- */
const COLORES_EVO = ['#1f6fd1', '#f08a00', '#1f9e3a', '#d7263d', '#c2289e', '#00a3b4', '#8c564b', '#6a3fc1', '#8a9a00', '#ff5c8a'];
const MEDIDAS_EVO = [{k: 'llamadas', n: 'llamadas', dash: null}, {k: 'conectadas', n: 'conectadas', dash: '7 4'}, {k: 'efectivas', n: 'efectivas', dash: '1.5 4'}];
const evoMetricas = new Set(['llamadas']);
let evoIniciado = false;
const evoAsesoras = new Set();
function asesorasEvo() {
  const g = dash.data('llamadas'); const m = new Map();
  if (g.status === 'ok') for (const r of g.data) if (r.direccion === 'Saliente') m.set(r.asesora, r.equipo);
  return [...m].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}
function colorAsesora(nombre) { const i = asesorasEvo().findIndex(([a]) => a === nombre); return COLORES_EVO[(i < 0 ? 0 : i) % COLORES_EVO.length]; }
function redibujarEvo() { dash.draw('evo_sel'); dash.draw('ch_evol'); }
function agrupaPorSemana() { const p = dash.params(); return lista(p.semanas).length > 1 || (!lista(p.semanas).length && !p.desde && !p.hasta); }
document.querySelectorAll('#seg-evo-metrica button').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.m;
  if (evoMetricas.has(k)) evoMetricas.delete(k); else evoMetricas.add(k);
  document.querySelectorAll('#seg-evo-metrica button').forEach(x => x.setAttribute('aria-pressed', evoMetricas.has(x.dataset.m) ? 'true' : 'false'));
  dash.draw('ch_evol');
}));
dash.draw('evo_periodo', el => {
  const p = dash.params(); const sem = lista(p.semanas).map(Number).sort((a, b) => a - b);
  let t = sem.length ? (sem.length === 1 ? `semana ${sem[0]} (${fCorto(inicioSemana(sem[0]))} – ${fCorto(addDays(inicioSemana(sem[0]), 6))})` : `semanas ${sem.join(', ')}`) : (p.desde || p.hasta ? etiquetaFecha(p) : 'todo el periodo');
  el.textContent = t + (agrupaPorSemana() ? ' · un punto por semana' : ' · un punto por día');
});
dash.draw('evo_sel', el => {
  el.replaceChildren();
  const todas = asesorasEvo();
  if (!todas.length) { el.textContent = '—'; return; }
  if (!evoIniciado) { todas.forEach(([a]) => evoAsesoras.add(a)); evoIniciado = true; }
  const nota = document.createElement('p'); nota.className = 'evo-nota'; nota.textContent = 'Marca una o varias asesoras. El nombre del equipo marca o quita todo el grupo.';
  el.appendChild(nota);
  ['Posgrados', 'Pregrados'].forEach(eq => {
    const del = todas.filter(([, e]) => e === eq).map(([a]) => a); if (!del.length) return;
    const g = document.createElement('div'); g.className = 'evo-grupo';
    const marcadas = del.filter(a => evoAsesoras.has(a)).length;
    const cab = document.createElement('button'); cab.type = 'button'; cab.className = 'evo-equipo';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.tabIndex = -1; cb.checked = marcadas === del.length; cb.indeterminate = marcadas > 0 && marcadas < del.length;
    cab.append(cb, document.createTextNode(eq));
    cab.setAttribute('aria-pressed', marcadas === del.length ? 'true' : 'false');
    cab.onclick = () => { if (marcadas === del.length) del.forEach(a => evoAsesoras.delete(a)); else del.forEach(a => evoAsesoras.add(a)); redibujarEvo(); };
    g.appendChild(cab);
    del.forEach(a => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'evo-op'; const on = evoAsesoras.has(a); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const c = document.createElement('input'); c.type = 'checkbox'; c.tabIndex = -1; c.checked = on;
      const i = document.createElement('i'); if (on) i.style.borderTopColor = colorAsesora(a);
      b.append(c, i, document.createTextNode(a)); b.onclick = () => { on ? evoAsesoras.delete(a) : evoAsesoras.add(a); redibujarEvo(); };
      g.appendChild(b);
    });
    el.appendChild(g);
  });
  const acc = document.createElement('div'); acc.className = 'evo-acciones';
  const t = document.createElement('button'); t.type = 'button'; t.className = 'evo-limpiar'; t.textContent = 'Marcar todas'; t.onclick = () => { todas.forEach(([a]) => evoAsesoras.add(a)); redibujarEvo(); };
  const n = document.createElement('button'); n.type = 'button'; n.className = 'evo-limpiar'; n.textContent = 'Quitar todas'; n.onclick = () => { evoAsesoras.clear(); redibujarEvo(); };
  acc.append(t, n); el.appendChild(acc);
});
dash.draw('ch_evol', el => {
  const rows = filasDe('evol_s', el); if (!rows) return;
  el.replaceChildren();
  const medidas = MEDIDAS_EVO.filter(m => evoMetricas.has(m.k));
  const periodo = agrupaPorSemana() ? 'semana' : 'dia';
  const clave = r => periodo === 'semana' ? semanaDe(r.fecha) : r.fecha;
  const periodos = [...new Set(rows.map(clave))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const etiqueta = p => periodo === 'semana' ? `S${p}` : fCorto(p);
  const detalle = p => periodo === 'semana' ? `Semana ${p} (${fCorto(inicioSemana(p))} – ${fCorto(addDays(inicioSemana(p), 6))})` : fLargo(p);
  const suma = new Map();
  for (const r of rows) { const c = r.asesora + '|' + clave(r); if (!suma.has(c)) suma.set(c, {llamadas: 0, conectadas: 0, efectivas: 0}); const o = suma.get(c); o.llamadas += r.llamadas; o.conectadas += r.conectadas; o.efectivas += r.efectivas; }
  const cero = {llamadas: 0, conectadas: 0, efectivas: 0};
  const todasEvo = asesorasEvo();
  const verProm = evoAsesoras.size > 0 && evoAsesoras.size < todasEvo.length;
  const prom = periodos.map(p => { const vs = todasEvo.filter(([a]) => evoAsesoras.has(a)).map(([a]) => suma.get(a + '|' + p)).filter(v => v && v.llamadas > 0); const n = vs.length || 1;
    return {llamadas: d3.sum(vs, v => v.llamadas) / n, conectadas: d3.sum(vs, v => v.conectadas) / n, efectivas: d3.sum(vs, v => v.efectivas) / n, n: vs.length}; });
  const asesoras = todasEvo.filter(([a]) => evoAsesoras.has(a)).map(([a]) => ({nombre: a, color: colorAsesora(a), vals: periodos.map(p => suma.get(a + '|' + p) || cero)}));
  if (!medidas.length) { const d = document.createElement('div'); d.className = 'vacio'; d.textContent = 'Marca al menos una medida en Medir.'; el.appendChild(d); return; }
  if (!asesoras.length) { const d = document.createElement('div'); d.className = 'vacio'; d.textContent = 'Marca al menos una asesora en el selector.'; el.appendChild(d); return; }
  if (!periodos.length) { const d = document.createElement('div'); d.className = 'vacio'; d.textContent = 'No hay llamadas en esas fechas.'; el.appendChild(d); return; }
  const w = Math.max(el.clientWidth, 280), h = 340;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).style('display', 'block').attr('role', 'img').attr('aria-label', `Rendimiento por asesora: ${medidas.map(m => m.n).join(', ')}`);
  const maxV = d3.max([...asesoras.flatMap(s => s.vals), ...(verProm ? prom : [])].flatMap(v => medidas.map(m => v[m.k]))) || 0;
  const y = d3.scaleLinear().domain([0, Math.max(4, maxV * 1.08)]).nice(5);
  const ticks = y.ticks(5).filter(Number.isInteger);
  const m = {t: 14, r: 16, b: 30, l: medirTexto(svg, n0(ticks[ticks.length - 1]), 11) + 14};
  y.range([h - m.b, m.t]);
  const x = d3.scalePoint().domain(periodos.map(String)).range([m.l + 10, w - m.r - 10]).padding(periodos.length === 1 ? 0.5 : 0);
  ejeY(svg, y, ticks, n0, m, w);
  const paso = Math.max(1, Math.ceil(periodos.length / Math.max(1, Math.floor((w - m.l - m.r) / 56))));
  periodos.forEach((p, i) => { if (i % paso) return; svg.append('text').attr('x', x(String(p))).attr('y', h - m.b + 18).attr('text-anchor', 'middle').style('fill', 'var(--cds-text-secondary)').style('font-size', '11px').text(etiqueta(p)); });
  const r0 = periodos.length > 20 ? 2.2 : (periodos.length === 1 ? 5 : 3.4);
  medidas.forEach(md => asesoras.forEach(s => {
    const linea = d3.line().x((v, i) => x(String(periodos[i]))).y(v => y(v[md.k]));
    if (periodos.length > 1) { const pth = svg.append('path').attr('d', linea(s.vals)).style('fill', 'none').style('stroke', s.color).style('stroke-width', md.k === 'efectivas' ? 2.6 : 2.2).style('stroke-linejoin', 'round').style('stroke-linecap', 'round'); if (md.dash) pth.style('stroke-dasharray', md.dash); }
    s.vals.forEach((v, i) => {
      const cx = x(String(periodos[i])), cy = y(v[md.k]);
      if (md.k === 'llamadas') svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r0).style('fill', s.color);
      else if (md.k === 'conectadas') svg.append('rect').attr('x', cx - r0).attr('y', cy - r0).attr('width', r0 * 2).attr('height', r0 * 2).style('fill', s.color);
      else svg.append('path').attr('d', d3.symbol(d3.symbolTriangle, r0 * r0 * 4.2)()).attr('transform', `translate(${cx},${cy})`).style('fill', s.color);
    });
  }));
  const etqProm = [];
  if (verProm) medidas.slice().reverse().forEach(md => {
    const COL = '#000';
    if (periodos.length > 1) { const pth = svg.append('path').attr('d', d3.line().x((v, i) => x(String(periodos[i]))).y(v => y(v[md.k]))(prom)).style('fill', 'none').style('stroke', COL).style('stroke-width', 3.2).style('stroke-linecap', 'round'); if (md.dash) pth.style('stroke-dasharray', md.dash); }
    prom.forEach((v, i) => svg.append('circle').attr('cx', x(String(periodos[i]))).attr('cy', y(v[md.k])).attr('r', periodos.length === 1 ? 5 : 3).style('fill', '#fff').style('stroke', COL).style('stroke-width', 2));
    const ult = prom[prom.length - 1];
    let ly = y(ult[md.k]) - 9; while (etqProm.some(v => Math.abs(v - ly) < 14)) ly -= 14; etqProm.push(ly);
    svg.append('text').attr('x', x(String(periodos[periodos.length - 1])) - 6).attr('y', ly).attr('text-anchor', 'end').style('fill', COL).style('font-size', '11px').style('font-weight', '600').style('paint-order', 'stroke').style('stroke', 'var(--color-bg)').style('stroke-width', 3).text(medidas.length > 1 ? `Promedio ${md.n}` : 'Promedio');
  });
  if (periodos.length <= 3 && medidas.length === 1 && asesoras.length <= 4) asesoras.forEach(s => s.vals.forEach((v, i) => svg.append('text').attr('x', x(String(periodos[i])) + 9).attr('y', y(v[medidas[0].k])).attr('dy', '0.35em').style('fill', s.color).style('font-size', '11px').style('font-weight', '600').style('font-variant-numeric', 'tabular-nums').text(n0(v[medidas[0].k]))));
  const tip = mkTip(el);
  const ancho = periodos.length > 1 ? x.step() : (w - m.l - m.r);
  const orden = medidas[0].k;
  periodos.forEach((p, i) => svg.append('rect').attr('x', x(String(p)) - ancho / 2).attr('y', m.t).attr('width', ancho).attr('height', h - m.b - m.t).style('fill', 'transparent')
    .on('mousemove', ev => tip.show([detalle(p), ...asesoras.slice().sort((a, b) => b.vals[i][orden] - a.vals[i][orden]).map(s => `${s.nombre}: ${medidas.map(md => `${n0(s.vals[i][md.k])} ${md.n}`).join(' · ')}`), ...(verProm ? [`Promedio (${prom[i].n} asesoras): ${medidas.map(md => `${n1(prom[i][md.k])} ${md.n}`).join(' · ')}`] : [])], ev)).on('mouseleave', () => tip.hide()));
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
