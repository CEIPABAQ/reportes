/* ---------- Pestañas CRM pregrado y CRM posgrado: cruce de las llamadas salientes con HubSpot (datos en crm.js) ---------- */
/* Usa las utilidades de app.js (dash, lista, agrupar, cuerpo, hbars, formatos); se carga después de él.
   Los datos personales de los leads (nombre, cédula, teléfono, correo, observaciones) solo existen en crm_privado.js,
   que se genera en el computador donde se actualiza el panel y nunca se sube a GitHub. */

/* ======== Carga ======== */
// Cada pestaña muestra un solo pipeline; las llamadas a números que no están en el CRM van con el equipo de la pestaña
const CRM_TABS = {
  'crm-pregrado': {pipeline: 'Pregrado Barranquilla', equipo: 'Pregrados', nombre: 'CRM pregrado'},
  'crm-posgrado': {pipeline: 'Especializaciones', equipo: 'Posgrados', nombre: 'CRM posgrado'}
};
const crmTab = () => CRM_TABS[tabActual] || CRM_TABS['crm-pregrado'];
const crmPipe = () => crmTab().pipeline;

let crmNeg = null;
function crmNegocios() {
  if (crmNeg) return crmNeg;
  const C = window.CRM;
  if (!C || !C.negocios) return (crmNeg = []);
  const de = (arr, i) => (i === '' || i == null || i < 0 || !arr) ? null : arr[i];
  crmNeg = C.negocios.filas.map((r, k) => {
    const n = {k, id: String(r[0]), pipeline: de(C.pipelines, r[1]), etapa: de(C.etapas, r[2]), canal: de(C.canales, r[3]),
      activador: de(C.activadores, r[4]), dueno: de(C.duenos, r[5]), actividad: de(C.actividades, r[6]), programa: de(C.programas, r[7]),
      campana: de(C.campanas, r[8]), tipo: de(C.tipos, r[9]), modalidad: de(C.modalidades, r[10]), jornada: de(C.jornadas, r[11]),
      creado: r[12] || '', contactado: r[13] || '', cita: r[14] || '', inscripcion: r[15] || '', ne: r[16] || '',
      stock: r[17] || '', evento: r[18] || '', fuente: r[19] || ''};
    n.fecha = n.creado.slice(0, 10);
    n.hitos = (n.contactado ? 1 : 0) | (n.cita ? 2 : 0) | (n.inscripcion ? 4 : 0) | (n.ne ? 8 : 0);
    return n;
  });
  return crmNeg;
}
let crmFilas = null;
function crmCargar() {
  if (crmFilas) return crmFilas;
  const C = window.CRM, A = (window.DATOS || {}).asesoras || [], T = (window.DATOS || {}).tipificaciones || [];
  if (!C || !C.negocios) return (crmFilas = []);
  const N = crmNegocios();
  // columnas: f, h, ai, ci, ti, neg, num, propia, tramo, llamadas
  crmFilas = C.filas.map(r => {
    const n = r[5] >= 0 ? N[r[5]] : null, a = A[r[2]];
    return {fecha: r[0], hora: r[1], asesora: a ? a.nombre : '—', equipo: a ? a.equipo : '—', clase: r[3], tip: T[r[4]] || '—',
      neg: r[5], num: r[6], propia: r[7], tramo: r[8], llamadas: r[9],
      pipeline: n ? n.pipeline : (r[5] === -2 ? '(otro pipeline)' : null), etapa: n ? n.etapa : null, canal: n ? n.canal : null,
      activador: n ? n.activador : null, dueno: n ? n.dueno : null, actividad: n ? n.actividad : null, programa: n ? n.programa : null,
      campana: n ? n.campana : null, tipo: n ? n.tipo : null, hitos: n ? n.hitos : 0};
  });
  return crmFilas;
}
// Leads de los dos pipelines creados desde el inicio de la base, llamados o no
let crmLeads = null;
function crmLeadsCargar() {
  if (crmLeads) return crmLeads;
  const L = (window.CRM || {}).leads, A = (window.DATOS || {}).asesoras || [];
  if (!L || !(window.CRM || {}).negocios) return (crmLeads = []);
  const N = crmNegocios(), eqDe = new Map(A.map(a => [a.nombre, a.equipo]));
  crmLeads = L.filas.map(r => {
    const n = N[r[0]];
    return {neg: r[0], fecha: n.fecha, pipeline: n.pipeline, etapa: n.etapa, canal: n.canal, dueno: n.dueno, tipo: n.tipo,
      equipo: eqDe.get(n.dueno) || null, llamado: r[1], abierto: r[2], sin_tel: r[3], leads: 1};
  });
  return crmLeads;
}
// Llamadas de cada lead (todo el historial), para su ficha
let crmPorNeg = null;
function llamadasDe(neg) {
  if (!crmPorNeg) { crmPorNeg = new Map(); for (const r of crmCargar()) if (r.neg >= 0) { if (!crmPorNeg.has(r.neg)) crmPorNeg.set(r.neg, []); crmPorNeg.get(r.neg).push(r); } }
  return (crmPorNeg.get(neg) || []).slice().sort((a, b) => (a.fecha + String(a.hora).padStart(2, '0')).localeCompare(b.fecha + String(b.hora).padStart(2, '0')));
}
// Datos personales: solo si crm_privado.js está en este computador
const privado = id => {
  const P = window.CRM_PRIVADO; if (!P || !P.fichas[id]) return null;
  const o = {}; P.campos.forEach((c, i) => { o[c.replace(/^p_/, '')] = P.fichas[id][i]; }); return o;
};

// Guarda en cada fila de las tablas el grupo de filas que la forman, para abrir la lista de leads al hacer clic
const conFilas = (obj, rows, base = 'llamadas') => { Object.defineProperty(obj, '_rows', {value: rows, enumerable: false}); Object.defineProperty(obj, '_base', {value: base, enumerable: false}); return obj; };

/* ======== Filtros ======== */
const enFiltroLead = (r, p) => (!p.crm_tipo || r.tipo === p.crm_tipo) && (!p.crm_canal || r.canal === p.crm_canal);
dash.calc('crm_todas', {
  inputs: [], title: 'Llamadas salientes cruzadas con el CRM, con los filtros de fecha, equipo y asesora',
  fn: () => {
    const p = dash.params();
    const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return crmCargar().filter(r =>
      (!p.desde || r.fecha >= p.desde) && (!p.hasta || r.fecha <= p.hasta) &&
      (!sem.length || sem.includes(semanaDe(r.fecha))) && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) &&
      (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.asesora)));
  }
});
dash.calc('crm_filtro', {
  inputs: ['crm_todas'], title: 'Llamadas a leads del pipeline de la pestaña (o que no están en el CRM, del equipo de la pestaña), con tipo de lead y canal',
  fn: t => {
    const p = dash.params(), P = crmPipe(), E = crmTab().equipo, extra = p.crm_tipo || p.crm_canal;
    return t.filter(r => r.neg >= 0 ? (r.pipeline === P && enFiltroLead(r, p)) : (r.neg === -1 && !extra && r.equipo === E));
  }
});
function medirCrm(rows) {
  let llamadas = 0, conectadas = 0, efectivas = 0, propias = 0, ajenas = 0, sin_dueno = 0;
  const nums = new Set(), numsEfec = new Set();
  for (const r of rows) {
    llamadas += r.llamadas; nums.add(r.num);
    if (r.clase > 0) conectadas += r.llamadas;
    if (r.clase === 2) { efectivas += r.llamadas; numsEfec.add(r.num); }
    if (r.propia === 1) propias += r.llamadas; else if (r.propia === 0) ajenas += r.llamadas; else if (r.propia === 2) sin_dueno += r.llamadas;
  }
  const div = (a, b) => b ? a / b : null;
  return {llamadas, conectadas, efectivas, numeros: nums.size, propias, ajenas, sin_dueno,
    pct_conect: div(conectadas, llamadas), pct_efec: div(efectivas, llamadas),
    pct_propias: div(propias, propias + ajenas + sin_dueno), por_lead: div(llamadas, nums.size), pct_leads_efec: div(numsEfec.size, nums.size)};
}
const enCrm = rows => rows.filter(r => r.neg >= 0);
const medirCon = (rs, base) => conFilas(medirCrm(rs), rs, base);
function crmPor(rows, key) {
  return [...agrupar(rows, key)].map(([k, rs]) => conFilas({[key]: k, ...medirCrm(rs)}, rs)).sort((a, b) => b.llamadas - a.llamadas);
}
dash.calc('crm_kpi', {
  inputs: ['crm_filtro', 'crm_todas'], title: 'Indicadores del cruce con el CRM',
  fn: (f, todas) => {
    const t = medirCrm(todas), c = enCrm(f), mc = medirCrm(c), no = medirCrm(f.filter(r => r.neg === -1));
    const otros = medirCrm(todas.filter(r => r.neg === -2 || (r.neg >= 0 && r.pipeline !== crmPipe())));
    const conAct = new Set(c.filter(r => r.activador !== '(sin activador)').map(r => r.num)).size;
    return [{llamadas: t.llamadas, en_crm: mc.llamadas, pct_en_crm: t.llamadas ? mc.llamadas / t.llamadas : null,
      llamadas_otros: otros.llamadas, numeros_otros: otros.numeros,
      numeros: t.numeros, numeros_crm: mc.numeros, numeros_no: no.numeros, llamadas_no: no.llamadas, conectadas_no: no.conectadas,
      propias: mc.propias, ajenas: mc.ajenas, sin_dueno: mc.sin_dueno, pct_propias: mc.pct_propias,
      numeros_activador: conAct, pct_activador: mc.numeros ? conAct / mc.numeros : null}];
  }
});
dash.calc('crm_tipos', {inputs: ['crm_filtro'], title: 'Llamadas por tipo de lead (flow o stock)', fn: f => crmPor(enCrm(f), 'tipo')});
dash.calc('crm_canales', {inputs: ['crm_filtro'], title: 'Llamadas por canal', fn: f => crmPor(enCrm(f), 'canal')});
dash.calc('crm_etapas', {
  inputs: ['crm_filtro'], title: 'Llamadas por etapa actual del lead',
  fn: f => {
    const r = crmPor(enCrm(f), 'etapa'); const no = f.filter(x => x.neg === -1);
    if (no.length) r.push({etapa: '(no está en el CRM)', ...medirCrm(no)});
    return r;
  }
});
dash.calc('crm_propia', {
  inputs: ['crm_filtro'], title: 'Asesora que llama frente a propietaria en HubSpot',
  fn: f => [...agrupar(enCrm(f), 'asesora')].map(([a, rs]) => {
    const m = medirCrm(rs);
    return conFilas({asesora: a, equipo: rs[0].equipo, en_crm: m.llamadas, propias: m.propias, ajenas: m.ajenas, sin_dueno: m.sin_dueno, pct_propias: m.pct_propias}, rs);
  }).sort((a, b) => b.en_crm - a.en_crm)
});
dash.calc('crm_ajenas', {
  inputs: ['crm_filtro'], title: 'Resumen por asesora de las llamadas a leads de otra persona',
  fn: f => [...agrupar(enCrm(f).filter(r => r.propia === 0), 'asesora')].map(([a, rs]) => conFilas({asesora: a, equipo: rs[0].equipo,
    duenas: new Set(rs.map(r => r.dueno)).size, ...medirCrm(rs)}, rs)).sort((a, b) => b.numeros - a.numeros)
});
// Activadoras que se muestran en la tabla (el resto de activadores no aparece)
const ACTIVADORAS = ['Maria Pacheco', 'Alison Villalba', 'Yeilen Guerrero', 'Katherin Garay', 'María Jose Ardila'];
const sinTilde = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const esActivadora = a => ACTIVADORAS.some(x => sinTilde(x) === sinTilde(a));
dash.calc('crm_activador_grupos', {
  inputs: ['crm_filtro'], title: 'Activador con el detalle de la actividad de ingreso de sus leads',
  fn: f => {
    // Los cursos y webinars con nombre propio se agrupan en "Evento"; las actividades con menos de 5 leads, en "Otras"
    const tipo = a => a && a.startsWith('Evento: ') ? 'Evento (cursos, webinars)' : (a || '(sin actividad)');
    return [...agrupar(enCrm(f).filter(r => esActivadora(r.activador)), 'activador')].map(([act, rs]) => {
      const hijos = [], otras = [];
      for (const [actividad, hs] of agrupar(rs.map(r => Object.assign({}, r, {act_tipo: tipo(r.actividad)})), 'act_tipo')) {
        const m = medirCrm(hs);
        if (m.numeros >= 5) hijos.push(conFilas({actividad, ...m}, hs)); else otras.push(...hs);
      }
      hijos.sort((a, b) => b.numeros - a.numeros);
      if (otras.length) hijos.push(conFilas({actividad: 'Otras', ...medirCrm(otras)}, otras));
      return conFilas({activador: act, ...medirCrm(rs), hijos}, rs);
    }).sort((a, b) => b.numeros - a.numeros);
  }
});

/* Tabla agrupada: una fila por grupo con su total y un botón para ver el detalle.
   Respeta el orden por columna y la fila de promedio de las demás tablas. */
const abiertos = {};
function cuerpoGrupos(tb, id, cols, hijoKey, limite, etiqueta = ['actividad', 'actividades']) {
  const g = dash.data(id); const nombre = tb.dataset.draw;
  tb.replaceChildren();
  if (g.status !== 'ok') return;
  abiertos[nombre] = abiertos[nombre] || new Set();
  const abierto = abiertos[nombre];
  let filas = g.data.slice();
  const o = orden[nombre];
  if (o) filas.sort((a, b) => {
    const x = a[o.k], y = b[o.k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', {numeric: true});
    return o.dir === 'desc' ? -c : c;
  });
  const tabla = tb.closest('table');
  const etiquetas = [...tabla.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const prom = cols.map(([k]) => { const vs = filas.map(r => r[k]).filter(v => typeof v === 'number' && isFinite(v)); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; });
  const conProm = filas.length > 1;
  const verTodo = abierto.has('__todas__');
  const visibles = limite && !verTodo ? filas.slice(0, limite) : filas;
  const celda = (tr, i, texto, fila, campo) => {
    const td = document.createElement('td'); if (etiquetas[i]) td.dataset.label = etiquetas[i]; td.appendChild(texto); tr.appendChild(td);
    if (fila) marcarClic(td, fila, campo);
    return td;
  };
  const span = t => { const s = document.createElement('span'); s.className = 'num'; s.textContent = t; return s; };
  visibles.forEach(r => {
    const clave = r[cols[0][0]], hijos = r[hijoKey] || [], exp = abierto.has(clave);
    const tr = document.createElement('tr'); tr.className = 'grupo';
    cols.forEach(([k, f], i) => {
      if (i === 0) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'expandir';
        b.setAttribute('aria-expanded', exp ? 'true' : 'false');
        b.textContent = `${exp ? '▾' : '▸'} ${r[k]}`;
        const n = document.createElement('small'); n.textContent = ` ${hijos.length} ${hijos.length === 1 ? etiqueta[0] : etiqueta[1]}`; b.appendChild(n);
        b.onclick = () => { exp ? abierto.delete(clave) : abierto.add(clave); dash.draw(nombre); };
        celda(tr, i, b);
      } else {
        const td = celda(tr, i, span(r[k] == null ? '—' : f(r[k])), r, k);
        if (conProm && typeof r[k] === 'number' && prom[i] != null && r[k] < prom[i] - 1e-9) td.classList.add('bajo');
      }
    });
    tb.appendChild(tr);
    if (exp) hijos.forEach(h => {
      const th = document.createElement('tr'); th.className = 'hijo';
      const hijoConGrupo = h._rows ? conFilas(Object.assign({}, h, {[cols[0][0]]: `${clave} · ${h.nombre_hijo || h.actividad}`}), h._rows, h._base) : null;
      cols.forEach(([k, f], i) => celda(th, i, document.createTextNode(i === 0 ? h.nombre_hijo || h.actividad : (h[k] == null ? '—' : f(h[k]))), i === 0 ? null : hijoConGrupo, k));
      tb.appendChild(th);
    });
  });
  if (limite && filas.length > limite) {
    const tr = document.createElement('tr'); tr.className = 'mas';
    const td = document.createElement('td'); td.colSpan = cols.length;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ver-mas';
    b.textContent = verTodo ? 'Ver menos' : `Ver los ${filas.length - limite} restantes`;
    b.onclick = () => { verTodo ? abierto.delete('__todas__') : abierto.add('__todas__'); dash.draw(nombre); };
    td.appendChild(b); tr.appendChild(td); tb.appendChild(tr);
  }
  if (conProm) {
    const tr = document.createElement('tr'); tr.className = 'prom';
    cols.forEach(([k, f], i) => celda(tr, i, document.createTextNode(i === 0 ? 'Promedio' : prom[i] == null ? '' : (f === n0 ? nf1.format(prom[i]) : f(prom[i])))));
    tb.appendChild(tr);
  }
}
/* Tablas largas sin grupos: muestra las primeras filas y un botón para ver el resto */
function recortar(tb, limite) {
  const nombre = tb.dataset.draw; abiertos[nombre] = abiertos[nombre] || new Set();
  const filas = [...tb.querySelectorAll('tr:not(.prom)')];
  if (filas.length <= limite) return;
  const verTodo = abiertos[nombre].has('__todas__');
  if (!verTodo) filas.slice(limite).forEach(tr => { tr.hidden = true; });
  const tr = document.createElement('tr'); tr.className = 'mas';
  const td = document.createElement('td'); td.colSpan = tb.closest('table').querySelectorAll('thead th').length;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ver-mas';
  b.textContent = verTodo ? 'Ver menos' : `Ver las ${filas.length - limite} restantes`;
  b.onclick = () => { verTodo ? abiertos[nombre].delete('__todas__') : abiertos[nombre].add('__todas__'); dash.draw(nombre); };
  td.appendChild(b); tr.appendChild(td);
  const promTr = tb.querySelector('tr.prom'); promTr ? tb.insertBefore(tr, promTr) : tb.appendChild(tr);
}
dash.calc('crm_velocidad', {
  inputs: ['crm_filtro'], title: 'Tiempo hasta la primera llamada de un lead nuevo',
  fn: f => {
    const T = (window.CRM || {}).tramos || [];
    const v = f.filter(r => r.tramo >= 0); const total = v.reduce((s, r) => s + r.llamadas, 0);
    return T.map((t, i) => {
      const rs = v.filter(r => r.tramo === i), m = medirCrm(rs);
      // la primera llamada de cada lead: la tabla cuenta leads y cómo les fue en esa llamada
      return conFilas({tramo: t, leads: m.llamadas, pct_leads: total ? m.llamadas / total : null, pct_conect: m.pct_conect, pct_efec: m.pct_efec}, rs);
    }).filter(r => r.leads > 0);
  }
});
dash.calc('crm_canal_rinde', {
  inputs: ['crm_filtro'], title: 'Rendimiento por canal',
  fn: f => crmPor(enCrm(f), 'canal').filter(r => r.numeros >= 30).sort((a, b) => (b.pct_leads_efec || 0) - (a.pct_leads_efec || 0))
});

/* Tablas */
dash.draw('t_crm_tipos', tb => cuerpo(tb, 'crm_tipos', [['tipo', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_efec', pc]]));
dash.draw('t_crm_etapas', tb => { cuerpo(tb, 'crm_etapas', [['etapa', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_efec', pc]]); recortar(tb, 8); });
dash.draw('t_crm_activadores', tb => cuerpoGrupos(tb, 'crm_activador_grupos', [['activador', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_efec', pc], ['pct_propias', pc]], 'hijos', 8));
dash.draw('t_crm_velocidad', tb => cuerpo(tb, 'crm_velocidad', [['tramo', S], ['leads', n0], ['pct_leads', pc], ['pct_conect', pc], ['pct_efec', pc]]));
dash.draw('t_crm_canal_rinde', tb => cuerpo(tb, 'crm_canal_rinde', [['canal', S], ['numeros', n0], ['por_lead', n1], ['pct_conect', pc], ['pct_leads_efec', pc]]));

/* Gráficos: las 8 categorías con más llamadas y el resto agrupado */
function barrasCrm(el, id, key, aria) {
  const rows = filasDe(id, el); if (!rows) return;
  const A = PAL.acc, top = rows.slice(0, 8), resto = rows.slice(8);
  const suma = k => resto.reduce((s, r) => s + r[k], 0);
  if (resto.length) top.push({[key]: `Otros (${resto.length})`, llamadas: suma('llamadas'), conectadas: suma('conectadas'), efectivas: suma('efectivas'), numeros: suma('numeros')});
  const total = rows.reduce((s, r) => s + r.llamadas, 0);
  hbars(el, top.map(r => ({
    label: r[key], seg: [{v: r.efectivas, color: A, name: 'Efectivas'}, {v: r.llamadas - r.efectivas, color: MUT, name: 'Resto de las llamadas'}],
    text: `${n0(r.llamadas)} · ${pc0(total ? r.llamadas / total : null)}`,
    tip: [`${n0(r.numeros)} leads`, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas`, `${n0(r.efectivas)} efectivas (${pc(r.llamadas ? r.efectivas / r.llamadas : null)} del total)`]
  })), {aria, legend: [{name: 'Efectivas', color: A}, {name: 'Resto de las llamadas', color: MUT}]});
}
dash.draw('ch_crm_tipos', el => barrasCrm(el, 'crm_tipos', 'tipo', 'Llamadas por tipo de lead'));
dash.draw('ch_crm_canales', el => barrasCrm(el, 'crm_canales', 'canal', 'Llamadas por canal'));

/* Textos */
dash.draw('crm_pipe_nombre', el => { el.textContent = crmPipe(); });
dash.draw('crm_tab_nombre', el => { el.textContent = crmTab().nombre; });
dash.draw('crm_equipo_nombre', el => { el.textContent = crmTab().equipo; });
dash.draw('crm_masivas', el => {
  const m = ((window.CRM || {}).cargas_masivas) || [];
  el.textContent = m.length ? `(más de 300 leads creados el mismo día: ${m.map(fLargo).join(', ')})` : '(más de 300 leads creados el mismo día)';
});
dash.draw('crm_sync', el => {
  const C = window.CRM;
  if (!C) { el.textContent = 'Todavía no hay cruce con el CRM: corre actualizar_datos.py en el computador con acceso al CRM.'; return; }
  const [f, h] = C.sincronizado.split(' ');
  el.textContent = `Cruce actualizado el ${fLargo(f)} a las ${h}.`;
});
dash.draw('crm_privado_aviso', el => {
  el.textContent = window.CRM_PRIVADO
    ? 'Este computador tiene los datos personales de los leads: la ficha muestra nombre, cédula, teléfono, correo y observaciones. No compartas capturas fuera del equipo.'
    : 'Haz clic en cualquier cifra de las tablas para ver los leads que la forman y su ficha en HubSpot. Los nombres, cédulas y teléfonos solo se ven en el computador donde se actualiza el panel.';
});
dash.draw('crm_otros', el => {
  const g = dash.data('crm_kpi'); const k = g.status === 'ok' && g.data[0];
  el.textContent = k && k.llamadas_otros ? `${n0(k.llamadas_otros)} llamadas (${n0(k.numeros_otros)} números) fueron a leads de otros pipelines y no se muestran aquí.` : '';
});
dash.draw('crm_no_texto', el => {
  const g = dash.data('crm_kpi'); const k = g.status === 'ok' && g.data[0];
  const p = dash.params();
  if (p.crm_tipo || p.crm_canal) { el.textContent = 'Con el filtro de tipo de lead o de canal solo se cuentan números que están en el CRM.'; return; }
  if (!k || !k.llamadas) { el.textContent = 'Sin llamadas para estos filtros.'; return; }
  if (!k.numeros_no) { el.textContent = `Todos los números que llamó el equipo de ${crmTab().equipo} con estos filtros aparecen en el CRM.`; return; }
  el.textContent = `${n0(k.numeros_no)} números que llamó el equipo de ${crmTab().equipo} (${n0(k.llamadas_no)} llamadas, ${n0(k.conectadas_no)} conectadas) no aparecen en el CRM con ningún formato del teléfono. ` +
    'Pueden ser leads que nunca se registraron, números escritos distinto en HubSpot o llamadas que no son de admisiones. ' +
    'La lista con los números está solo en el computador donde se actualiza el panel (archivo crm_no_encontrados.csv); aquí no se publica.';
});
dash.draw('crm_reco_vel', el => {
  const g = dash.data('crm_velocidad'); const rows = g.status === 'ok' ? g.data.filter(r => r.leads >= 20) : [];
  if (rows.length < 2) { el.textContent = 'Hay pocos leads nuevos con estos filtros para comparar. Prueba con un rango más largo.'; return; }
  const rapido = rows[0], lento = rows[rows.length - 1];
  const total = g.data.reduce((s, r) => s + r.leads, 0);
  let t = `De ${n0(total)} leads nuevos, el ${pc(rapido.pct_leads)} recibió la primera llamada en ${rapido.tramo.toLowerCase()} y contestó el ${pc(rapido.pct_conect)}; ` +
    `cuando la primera llamada llegó en ${lento.tramo.toLowerCase()}, contestó el ${pc(lento.pct_conect)}. `;
  t += (rapido.pct_conect || 0) - (lento.pct_conect || 0) >= 0.03
    ? 'Recomendación: llamar los leads nuevos lo antes posible después de que entran, y revisar que la asignación en HubSpot le llegue rápido a la asesora.'
    : 'Con estos filtros la rapidez no cambia mucho la conexión; conviene revisarlo con más días antes de cambiar la forma de trabajo.';
  el.textContent = t;
});
dash.draw('crm_reco_canal', el => {
  const g = dash.data('crm_canal_rinde'); const rows = g.status === 'ok' ? g.data : [];
  if (rows.length < 2) { el.textContent = 'Hay pocos canales con 30 leads o más con estos filtros para comparar.'; return; }
  const mejor = rows[0], peor = rows[rows.length - 1];
  el.textContent = `${mejor.canal} es el canal con más leads contactados de forma efectiva (${pc(mejor.pct_leads_efec)}, con ${n1(mejor.por_lead)} llamadas por lead); ` +
    `${peor.canal} es el más bajo (${pc(peor.pct_leads_efec)}, con ${n1(peor.por_lead)} llamadas por lead). ` +
    'Recomendación: dar prioridad a los canales que más se convierten en contacto, y revisar con quien carga los leads la calidad de los datos de los canales que necesitan muchas llamadas para lograr un contacto.';
});

/* ======== Resultado de las llamadas: en qué terminaron hoy los leads llamados ======== */
// Hitos de HubSpot (bits): 1 contactado, 2 cita, 4 inscripción, 8 matrícula
function medirResultado(rows) {
  const leads = new Map();
  let llamadas = 0, conectadas = 0;
  const efec = new Set();
  for (const r of rows) {
    llamadas += r.llamadas; if (r.clase > 0) conectadas += r.llamadas; if (r.clase === 2) efec.add(r.num);
    if (!leads.has(r.num)) leads.set(r.num, {hitos: r.hitos, llamadas: 0});
    leads.get(r.num).llamadas += r.llamadas;
  }
  let contactados = 0, citas = 0, inscritos = 0, matriculados = 0;
  for (const l of leads.values()) {
    if (l.hitos & 1) contactados++;
    if (l.hitos & 2) citas++;
    if (l.hitos & 4) inscritos++;
    if (l.hitos & 8) matriculados++;
  }
  const n = leads.size, div = (a, b) => b ? a / b : null;
  return {leads: n, llamadas, pct_conect: div(conectadas, llamadas), pct_leads_efec: div(efec.size, n),
    contactados, pct_contactados: div(contactados, n), citas, pct_citas: div(citas, n), inscritos, pct_inscritos: div(inscritos, n),
    matriculados, llamadas_por_cita: div(llamadas, citas)};
}
const VER_POR = {asesora: 'Asesora que llama', canal: 'Canal', activador: 'Activador', programa: 'Programa académico', campana: 'Campaña (solo Internet)', tipo: 'Tipo de lead'};
document.querySelectorAll('#seg-resultado button').forEach(b => b.addEventListener('click', () => {
  const por = b.dataset.por;
  document.querySelectorAll('#seg-resultado button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  const th = document.querySelector('#crm-resultado th[data-field="grupo"]'); if (th) th.textContent = VER_POR[por];
  if (abiertos.t_crm_resultado) abiertos.t_crm_resultado.clear();
  dash.setParams({crm_por: por});
}));
dash.calc('crm_resultado_kpi', {inputs: ['crm_filtro'], title: 'Embudo de los leads llamados', fn: f => { const rs = enCrm(f); return [conFilas(medirResultado(rs), rs)]; }});
dash.calc('crm_resultado', {
  inputs: ['crm_filtro'], title: 'Resultado de los leads llamados, por grupo',
  fn: f => {
    const k = dash.params().crm_por || 'asesora';
    let rs = enCrm(f);
    if (k === 'campana') rs = rs.filter(r => r.canal === 'Internet');
    return [...agrupar(rs, k)].map(([g, xs]) => conFilas({grupo: g, ...medirResultado(xs)}, xs)).sort((a, b) => b.leads - a.leads);
  }
});
dash.draw('t_crm_resultado', tb => {
  cuerpo(tb, 'crm_resultado', [['grupo', S], ['leads', n0], ['pct_conect', pc], ['pct_leads_efec', pc], ['pct_contactados', pc],
    ['citas', n0], ['pct_citas', pc], ['inscritos', n0], ['matriculados', n0], ['llamadas_por_cita', n1]]);
  recortar(tb, 10);
});
dash.draw('crm_resultado_nota', el => {
  const g = dash.data('crm_resultado_kpi'); const k = g.status === 'ok' && g.data[0];
  if (!k || !k.leads) { el.textContent = 'Sin leads llamados con estos filtros.'; return; }
  el.textContent = `De ${n0(k.leads)} leads llamados, el ${pc(k.pct_contactados)} figura hoy como contactado en HubSpot, el ${pc(k.pct_citas)} tiene cita, ` +
    `${n0(k.inscritos)} se inscribieron y ${n0(k.matriculados)} se matricularon. Por cada lead con cita se hicieron ${n1(k.llamadas_por_cita)} llamadas en total.`;
});

/* ======== Leads que nadie ha llamado ======== */
dash.calc('crm_leads_filtro', {
  inputs: [], title: 'Leads del pipeline creados en el periodo (por fecha de creación); los filtros de equipo y asesora se aplican a la propietaria',
  fn: () => {
    const p = dash.params(), P = crmPipe();
    const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return crmLeadsCargar().filter(r => r.pipeline === P && enFiltroLead(r, p) &&
      (!p.desde || r.fecha >= p.desde) && (!p.hasta || r.fecha <= p.hasta) &&
      (!sem.length || sem.includes(semanaDe(r.fecha))) && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) &&
      (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.dueno)));
  }
});
const hoyCrm = () => ((window.CRM || {}).sincronizado || '').slice(0, 10);
const esViejo = r => { const h = hoyCrm(); return !!h && r.fecha < addDays(h, -3); };
function medirLeads(rows) {
  let leads = 0, llamados = 0, pendientes = 0, viejos = 0;
  for (const r of rows) {
    leads += r.leads; if (r.llamado) llamados += r.leads;
    if (!r.llamado && r.abierto) { pendientes += r.leads; if (esViejo(r)) viejos += r.leads; }
  }
  return conFilas({leads, llamados, pct_llamados: leads ? llamados / leads : null, pendientes, viejos}, rows, 'leads');
}
dash.calc('crm_leads_kpi', {inputs: ['crm_leads_filtro'], title: 'Cobertura de llamadas', fn: f => [medirLeads(f)]});
dash.calc('crm_leads_duenos', {
  inputs: ['crm_leads_filtro'], title: 'Leads sin llamar por propietaria, con el detalle por canal',
  fn: f => [...agrupar(f, 'dueno')].map(([d, rs]) => conFilas({dueno: d, en_aircall: rs[0].equipo ? 'Sí' : 'No', ...medirLeads(rs),
    hijos: [...agrupar(rs, 'canal')].map(([c, xs]) => { const m = medirLeads(xs); return conFilas({nombre_hijo: c, ...m}, xs, 'leads'); }).filter(h => h.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes)}, rs, 'leads'))
    .filter(r => r.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes)
});
dash.draw('t_crm_leads_duenos', tb => cuerpoGrupos(tb, 'crm_leads_duenos',
  [['dueno', S], ['en_aircall', S], ['leads', n0], ['pct_llamados', pc], ['pendientes', n0], ['viejos', n0]], 'hijos', 10, ['canal', 'canales']));

/* ======== Leads intentados demasiado ======== */
document.querySelectorAll('#seg-saturados button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#seg-saturados button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  dash.setParams({crm_sat: +b.dataset.n});
}));
dash.calc('crm_saturados_base', {
  inputs: ['crm_filtro'], title: 'Leads con muchas llamadas en el periodo y ninguna conectada',
  fn: f => {
    const n = dash.params().crm_sat || 6, m = new Map();
    for (const r of enCrm(f)) {
      if (!m.has(r.num)) m.set(r.num, {neg: r.neg, llamadas: 0, conectadas: 0, dueno: r.dueno || '(sin propietario)', etapa: r.etapa, canal: r.canal});
      const x = m.get(r.num); x.llamadas += r.llamadas; if (r.clase > 0) x.conectadas += r.llamadas;
    }
    return [...m.values()].filter(x => x.llamadas >= n && x.conectadas === 0);
  }
});
const medirSat = xs => { const ll = xs.reduce((s, x) => s + x.llamadas, 0); return conFilas({leads: xs.length, llamadas: ll, por_lead: xs.length ? ll / xs.length : null}, xs, 'sat'); };
dash.calc('crm_saturados_kpi', {
  inputs: ['crm_saturados_base', 'crm_filtro'], title: 'Resumen de leads intentados demasiado',
  fn: (xs, f) => { const total = medirCrm(enCrm(f)).llamadas; const m = medirSat(xs); return [conFilas({...m, pct_llamadas: total ? m.llamadas / total : null}, xs, 'sat')]; }
});
dash.calc('crm_saturados', {
  inputs: ['crm_saturados_base'], title: 'Leads intentados demasiado por propietaria, con el detalle por etapa',
  fn: xs => [...agrupar(xs, 'dueno')].map(([d, rs]) => { const m = medirSat(rs); return conFilas({dueno: d, ...m,
    hijos: [...agrupar(rs, 'etapa')].map(([e, ys]) => { const h = medirSat(ys); return conFilas({nombre_hijo: e, ...h}, ys, 'sat'); }).sort((a, b) => b.leads - a.leads)}, rs, 'sat'); })
    .sort((a, b) => b.leads - a.leads)
});
dash.draw('t_crm_saturados', tb => cuerpoGrupos(tb, 'crm_saturados', [['dueno', S], ['leads', n0], ['llamadas', n0], ['por_lead', n1]], 'hijos', 10, ['etapa', 'etapas']));
dash.draw('crm_saturados_nota', el => {
  const g = dash.data('crm_saturados_kpi'); const k = g.status === 'ok' && g.data[0];
  const n = dash.params().crm_sat || 6;
  if (!k || !k.leads) { el.textContent = `Ningún lead recibió ${n} llamadas o más sin conectarse con estos filtros.`; return; }
  el.textContent = `${n0(k.leads)} leads recibieron ${n} llamadas o más en el periodo y ninguna se conectó: son ${n0(k.llamadas)} llamadas, el ${pc(k.pct_llamadas)} de las llamadas a este pipeline. ` +
    'Conviene decidir si se cierran, se intentan por WhatsApp o correo, o se revisa si el número está bien.';
});

/* ======== Filtros propios de las pestañas CRM: tipo de lead y canal ======== */
document.querySelectorAll('#seg-tipo button').forEach(b => b.addEventListener('click', () => dash.setParams({crm_tipo: b.dataset.tipo || null})));
document.querySelectorAll('#sel-canal').forEach(s => s.addEventListener('change', () => dash.setParams({crm_canal: s.value || null})));
dash.draw('crm_canal_opciones', sel => {
  const P = crmPipe(), actual = dash.params().crm_canal || '';
  const cuenta = new Map();
  for (const n of crmNegocios()) if (n.pipeline === P) cuenta.set(n.canal, (cuenta.get(n.canal) || 0) + 1);
  const ops = [...cuenta].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  if (actual && !ops.includes(actual)) ops.unshift(actual);
  sel.replaceChildren(new Option('Todos los canales', ''), ...ops.map(c => new Option(c, c)));
  sel.value = actual;
});

/* ======== Lista de leads detrás de una cifra y ficha de cada lead ======== */
// Qué leads forman cada columna: la cifra se calcula sobre ellos
const H = b => l => (l.n.hitos & b) > 0;
const CLIC = {
  llamadas: {}, numeros: {}, numeros_crm: {}, leads: {}, en_crm: {}, por_lead: {}, pct_leads: {},
  conectadas: {f: l => l.conect > 0, t: 'con alguna llamada conectada'}, pct_conect: {f: l => l.conect > 0, t: 'con alguna llamada conectada'},
  efectivas: {f: l => l.efec > 0, t: 'con alguna llamada efectiva'}, pct_efec: {f: l => l.efec > 0, t: 'con alguna llamada efectiva'},
  pct_leads_efec: {f: l => l.efec > 0, t: 'con alguna llamada efectiva'},
  contactados: {f: H(1), t: 'contactados en HubSpot'}, pct_contactados: {f: H(1), t: 'contactados en HubSpot'},
  citas: {f: H(2), t: 'con cita'}, pct_citas: {f: H(2), t: 'con cita'}, llamadas_por_cita: {f: H(2), t: 'con cita'},
  inscritos: {f: H(4), t: 'inscritos'}, pct_inscritos: {f: H(4), t: 'inscritos'}, matriculados: {f: H(8), t: 'matriculados'},
  propias: {f: l => l.propias > 0, t: 'llamados por su propietaria'}, pct_propias: {f: l => l.propias > 0, t: 'llamados por su propietaria'},
  ajenas: {f: l => l.ajenas > 0, t: 'de otra propietaria'}, sin_dueno: {f: l => l.sin_dueno > 0, t: 'sin propietario'}, duenas: {},
  llamados: {f: l => l.llamado, t: 'con al menos una llamada'}, pct_llamados: {f: l => l.llamado, t: 'con al menos una llamada'},
  pendientes: {f: l => !l.llamado && l.abierto, t: 'pendientes sin llamar'}, viejos: {f: l => !l.llamado && l.abierto && esViejo(l.n), t: 'pendientes de más de 3 días'}
};
function leadsDeFila(fila) {
  const rows = fila._rows || [], base = fila._base || 'llamadas', N = crmNegocios(), m = new Map();
  if (base === 'leads') {
    for (const r of rows) m.set(r.neg, {n: N[r.neg], llamado: r.llamado, abierto: r.abierto, llamadas: 0, conect: 0, efec: 0});
  } else if (base === 'sat') {
    for (const r of rows) m.set(r.neg, {n: N[r.neg], llamadas: r.llamadas, conect: 0, efec: 0});
  } else {
    for (const r of rows) {
      if (r.neg < 0) continue;
      if (!m.has(r.neg)) m.set(r.neg, {n: N[r.neg], llamadas: 0, conect: 0, efec: 0, propias: 0, ajenas: 0, sin_dueno: 0});
      const l = m.get(r.neg); l.llamadas += r.llamadas;
      if (r.clase > 0) l.conect += r.llamadas; if (r.clase === 2) l.efec += r.llamadas;
      if (r.propia === 1) l.propias += r.llamadas; else if (r.propia === 0) l.ajenas += r.llamadas; else if (r.propia === 2) l.sin_dueno += r.llamadas;
    }
  }
  return [...m.values()].filter(l => l.n);
}
function marcarClic(td, fila, campo) {
  if (!fila || !fila._rows || !CLIC[campo]) return;  // solo las filas de las pestañas CRM traen _rows
  if (fila._base === 'llamadas' && !fila._rows.some(r => r.neg >= 0)) return;
  td.classList.add('clic'); td.tabIndex = 0; td.setAttribute('role', 'button');
  td._fila = fila; td._campo = campo;
}
window.crmMarcarClic = marcarClic;  // la usa cuerpo() de app.js

const fA = f => f ? `${fCorto(f.slice(0, 10))} ${f.slice(0, 4)}` : '—';
const PRIV = () => !!window.CRM_PRIVADO;
let lista_ = null;  // {titulo, contexto, leads, filtro: {q, tipo, etapa}, mostrar, abierto: Set}
function abrirLista(td) {
  const fila = td._fila, campo = td._campo, regla = CLIC[campo];
  const tabla = td.closest('table'), sec = td.closest('[id^="crm-"]');
  const ths = [...tabla.querySelectorAll('thead th')];
  const col = ths[[...td.parentElement.children].indexOf(td)];
  const grupoCol = ths[0] ? ths[0].textContent.trim() : '';
  const claveGrupo = Object.keys(fila).find(k => typeof fila[k] === 'string');
  let leads = leadsDeFila(fila);
  if (regla.f) leads = leads.filter(regla.f);
  leads.sort((a, b) => b.llamadas - a.llamadas || (b.n.creado || '').localeCompare(a.n.creado || ''));
  const seccion = sec ? (sec.querySelector('h2, h3') || {}).textContent : '';
  lista_ = {titulo: `${claveGrupo ? fila[claveGrupo] : 'Todos'} · ${regla.t || (col ? col.textContent.trim().toLowerCase() : 'leads')}`,
    contexto: `${crmTab().nombre} · ${seccion || ''}${grupoCol ? ' · ' + grupoCol.toLowerCase() : ''}`,
    leads, base: fila._base || 'llamadas', filtro: {q: '', tipo: '', etapa: ''}, mostrar: 50, abierto: new Set()};
  dibujarLista();
  const dlg = document.getElementById('ficha');
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('input[type="search"]').focus();
}
function textoBusqueda(l) {
  const p = privado(l.n.id) || {};
  return [l.n.id, l.n.programa, l.n.etapa, l.n.canal, l.n.dueno, l.n.activador, p.nombre, p.cedula, p.telefono, p.correo].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function leadsVisibles() {
  const f = lista_.filtro, q = f.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return lista_.leads.filter(l => (!f.tipo || l.n.tipo === f.tipo) && (!f.etapa || l.n.etapa === f.etapa) && (!q || textoBusqueda(l).includes(q)));
}
function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const k in props) { if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else if (k.startsWith('on')) e[k] = props[k]; else e.setAttribute(k, props[k]); }
  hijos.flat().forEach(h => { if (h != null) e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
  return e;
}
function chip(texto, activo, onclick) { return el('button', {type: 'button', 'aria-pressed': activo ? 'true' : 'false', onclick, text: texto}); }
function dibujarLista() {
  const dlg = document.getElementById('ficha'), L = lista_;
  dlg.querySelector('.f-contexto').textContent = L.contexto;
  dlg.querySelector('.f-titulo').textContent = L.titulo;
  const vis = leadsVisibles();
  dlg.querySelector('.f-sub').textContent = `${n0(vis.length)} ${vis.length === 1 ? 'lead' : 'leads'}${vis.length !== L.leads.length ? ` de ${n0(L.leads.length)}` : ''} · estado de HubSpot al ${fLargo(hoyCrm())}` +
    (PRIV() ? '' : ' · sin datos personales en esta copia del panel');
  // Chips: tipo de lead y las etapas más comunes
  const cuenta = (k) => { const m = new Map(); L.leads.forEach(l => m.set(l.n[k], (m.get(l.n[k]) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
  const chips = dlg.querySelector('.f-chips'); chips.replaceChildren();
  const tipos = cuenta('tipo'), etapas = cuenta('etapa').slice(0, 6);
  chips.appendChild(el('span', {class: 'f-chips-k', text: 'Tipo'}));
  chips.appendChild(chip(`Todos ${n0(L.leads.length)}`, !L.filtro.tipo, () => { L.filtro.tipo = ''; L.mostrar = 50; dibujarLista(); }));
  tipos.forEach(([t, n]) => chips.appendChild(chip(`${t} ${n0(n)}`, L.filtro.tipo === t, () => { L.filtro.tipo = L.filtro.tipo === t ? '' : t; L.mostrar = 50; dibujarLista(); })));
  if (etapas.length > 1) {
    chips.appendChild(el('span', {class: 'f-chips-k', text: 'Etapa'}));
    etapas.forEach(([t, n]) => chips.appendChild(chip(`${t} ${n0(n)}`, L.filtro.etapa === t, () => { L.filtro.etapa = L.filtro.etapa === t ? '' : t; L.mostrar = 50; dibujarLista(); })));
  }
  // Tabla
  const tb = dlg.querySelector('tbody'); tb.replaceChildren();
  vis.slice(0, L.mostrar).forEach(l => {
    const n = l.n, p = privado(n.id), abierto = L.abierto.has(n.k);
    const nombre = p && p.nombre ? p.nombre : `Negocio ${n.id}`;
    const sub = p ? [p.cedula ? `CC ${p.cedula}` : null, p.telefono || null].filter(Boolean).join(' · ') : (n.tipo || '');
    const llam = L.base === 'leads' ? (l.llamado ? 'Llamado' : 'Sin llamar')
      : L.base === 'sat' ? `${n0(l.llamadas)} sin conectar` : `${n0(l.llamadas)} · ${n0(l.conect)} conect.`;
    const btn = el('button', {type: 'button', class: 'expandir', 'aria-expanded': abierto ? 'true' : 'false',
      onclick: () => { abierto ? L.abierto.delete(n.k) : L.abierto.add(n.k); dibujarLista(); }}, `${abierto ? '▾' : '▸'} ${nombre}`);
    tb.appendChild(el('tr', {class: abierto ? 'abierta' : ''},
      el('td', {'data-label': 'Lead'}, btn, el('small', {text: sub})),
      el('td', {'data-label': 'Programa', text: n.programa || '—'}),
      el('td', {'data-label': 'Etapa', text: n.etapa || '—'}),
      el('td', {'data-label': 'Canal', text: n.canal || '—'}),
      el('td', {'data-label': 'Propietaria', text: n.dueno || '—'}),
      el('td', {'data-label': 'Llamadas', class: 'n', text: llam})));
    if (abierto) tb.appendChild(el('tr', {class: 'detalle'}, el('td', {colspan: '6'}, fichaLead(n, p))));
  });
  if (!vis.length) tb.appendChild(el('tr', {}, el('td', {colspan: '6', class: 'vacio', text: 'Ningún lead coincide con la búsqueda.'})));
  const mas = dlg.querySelector('.f-mas'); mas.replaceChildren();
  if (vis.length > L.mostrar) mas.appendChild(el('button', {type: 'button', class: 'ver-mas', onclick: () => { L.mostrar += 100; dibujarLista(); }, text: `Ver ${n0(Math.min(100, vis.length - L.mostrar))} más (quedan ${n0(vis.length - L.mostrar)})`}));
}
function dato(k, v) { return el('div', {class: 'f-dato'}, el('span', {text: k}), el('b', {text: v || '—'})); }
function fichaLead(n, p) {
  const C = window.CRM || {};
  const caja = el('div', {class: 'f-ficha'});
  if (p) caja.appendChild(el('div', {class: 'f-bloque'}, el('h4', {text: 'Datos del lead'}),
    dato('Nombre', p.nombre), dato('Cédula', p.cedula), dato('Celular', p.telefono), dato('Correo', p.correo)));
  caja.appendChild(el('div', {class: 'f-bloque'}, el('h4', {text: 'De dónde viene'}),
    dato('Canal', n.canal), dato('Actividad de ingreso', n.actividad), dato('Activador', n.activador),
    dato('Campaña UTM', n.campana), dato('Fuente / medio', n.fuente), dato('Tipo de lead', n.tipo + (n.stock && n.tipo === 'Stock' ? ` (${n.stock})` : ''))));
  caja.appendChild(el('div', {class: 'f-bloque'}, el('h4', {text: 'Quién lo tiene'}),
    dato('Propietaria', n.dueno), dato('Pipeline', n.pipeline), dato('Creado en HubSpot', n.creado ? `${fA(n.creado)} ${n.creado.slice(11)}` : '—'),
    dato('ID del negocio', n.id)));
  caja.appendChild(el('div', {class: 'f-bloque'}, el('h4', {text: 'Cómo va'}),
    dato('Etapa', n.etapa), dato('Programa', n.programa), dato('Modalidad', n.modalidad), dato('Jornada', n.jornada),
    dato('Contactado', fA(n.contactado)), dato('Cita', fA(n.cita)), dato('Inscripción', fA(n.inscripcion)), dato('Matrícula (NE)', fA(n.ne))));
  // Llamadas en Aircall (todo el historial del número)
  const ll = llamadasDe(n.k), CL = ['No conectada', 'Conectada', 'Efectiva'];
  const bl = el('div', {class: 'f-bloque f-ancho'}, el('h4', {text: `Llamadas en Aircall (${n0(ll.reduce((s, r) => s + r.llamadas, 0))})`}));
  if (!ll.length) bl.appendChild(el('p', {class: 'f-nota', text: 'Nadie lo ha llamado por Aircall.'}));
  else bl.appendChild(el('ul', {class: 'f-llamadas'}, ll.map(r => el('li', {},
    el('span', {text: `${fA(r.fecha)} · ${String(r.hora).padStart(2, '0')}:00`}), el('span', {text: r.asesora}),
    el('span', {class: r.clase === 2 ? 'efec' : r.clase === 1 ? 'conect' : '', text: `${CL[r.clase]} · ${r.tip}${r.llamadas > 1 ? ` (×${r.llamadas})` : ''}`})))));
  caja.appendChild(bl);
  if (p) caja.appendChild(el('div', {class: 'f-bloque f-ancho'}, el('h4', {text: 'Observaciones en HubSpot'}),
    el('p', {class: 'f-obs', text: p.observaciones || 'Sin observaciones.'})));
  const acc = el('div', {class: 'f-acciones'});
  if (C.portal) acc.appendChild(el('a', {href: `https://app.hubspot.com/contacts/${C.portal}/record/0-3/${n.id}`, target: '_blank', rel: 'noopener', text: 'Abrir en HubSpot ↗'}));
  acc.appendChild(el('button', {type: 'button', class: 'ver-mas', onclick: ev => { copiar(n.id); ev.target.textContent = 'ID copiado'; }, text: 'Copiar ID del negocio'}));
  caja.appendChild(acc);
  return caja;
}
function copiar(t) { try { navigator.clipboard.writeText(t); } catch (e) {} }
function descargarCsv() {
  const vis = leadsVisibles(), priv = PRIV();
  const cols = [...(priv ? ['Nombre', 'Cédula', 'Celular', 'Correo'] : []), 'ID negocio', 'Pipeline', 'Etapa', 'Programa', 'Canal', 'Actividad', 'Activador', 'Campaña',
    'Tipo de lead', 'Propietaria', 'Creado', 'Contactado', 'Cita', 'Inscripción', 'Matrícula', 'Llamadas en el periodo'];
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const filas = vis.map(l => { const n = l.n, p = privado(n.id) || {};
    return [...(priv ? [p.nombre, p.cedula, p.telefono, p.correo] : []), n.id, n.pipeline, n.etapa, n.programa, n.canal, n.actividad, n.activador, n.campana,
      n.tipo, n.dueno, n.creado, n.contactado, n.cita, n.inscripcion, n.ne, l.llamadas].map(q).join(';'); });
  const blob = new Blob(['﻿' + [cols.map(q).join(';'), ...filas].join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = el('a', {href: URL.createObjectURL(blob), download: `leads_${lista_.titulo.replace(/[^\wáéíóúñ ]+/gi, '').trim().replace(/\s+/g, '_').slice(0, 60)}.csv`});
  document.body.appendChild(a); a.click(); a.remove();
}
(function prepararFicha() {
  const dlg = document.getElementById('ficha'); if (!dlg) return;
  dlg.querySelector('.f-cerrar').onclick = () => dlg.close();
  dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });  // clic fuera de la ventana
  dlg.querySelector('input[type="search"]').addEventListener('input', ev => { lista_.filtro.q = ev.target.value; lista_.mostrar = 50; dibujarLista(); });
  dlg.querySelector('.f-csv').onclick = descargarCsv;
  dlg.addEventListener('close', () => { dlg.querySelector('input[type="search"]').value = ''; });
  const sec = document.getElementById('crm');
  sec.addEventListener('click', ev => { const td = ev.target.closest('td.clic'); if (td && td._fila) abrirLista(td); });
  sec.addEventListener('keydown', ev => { const td = ev.target.closest && ev.target.closest('td.clic'); if (td && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrirLista(td); } });
})();

textDraw('n1', n1);
// Los selectores de la pestaña siguen a los filtros (por ejemplo, al usar "Limpiar filtros")
dash.onData(() => {
  const p = dash.params(), por = p.crm_por || 'asesora', sat = String(p.crm_sat || 6), tipo = p.crm_tipo || '';
  document.querySelectorAll('#seg-resultado button').forEach(x => x.setAttribute('aria-pressed', x.dataset.por === por ? 'true' : 'false'));
  document.querySelectorAll('#seg-saturados button').forEach(x => x.setAttribute('aria-pressed', x.dataset.n === sat ? 'true' : 'false'));
  document.querySelectorAll('#seg-tipo button').forEach(x => x.setAttribute('aria-pressed', (x.dataset.tipo || '') === tipo ? 'true' : 'false'));
  const th = document.querySelector('#crm-resultado th[data-field="grupo"]'); if (th) th.textContent = VER_POR[por];
});
