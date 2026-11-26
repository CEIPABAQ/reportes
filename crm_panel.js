/* ---------- Pestaña CRM: cruce de las llamadas salientes con HubSpot (datos en crm.js) ---------- */
/* Usa las utilidades de app.js (dash, lista, agrupar, cuerpo, hbars, formatos); se carga después de él. */
let crmFilas = null;
function crmCargar() {
  if (crmFilas) return crmFilas;
  const C = window.CRM, A = (window.DATOS || {}).asesoras || [];
  if (!C) return (crmFilas = []);
  const de = (arr, i) => i < 0 ? null : arr[i];
  crmFilas = C.filas.map(r => ({fecha: r[0], asesora: A[r[1]] ? A[r[1]].nombre : '—', equipo: A[r[1]] ? A[r[1]].equipo : '—', clase: r[2], num: r[3],
    pipeline: de(C.pipelines, r[4]), etapa: de(C.etapas, r[5]), canal: de(C.canales, r[6]), activador: de(C.activadores, r[7]),
    dueno: de(C.duenos, r[8]), propia: r[9], tramo: r[10], actividad: de(C.actividades || [], r[11]),
    programa: de(C.programas || [], r[12]), campana: de(C.campanas || [], r[13]), hitos: r[14], llamadas: r[15]}));
  return crmFilas;
}
// Leads de los pipelines del panel (creados desde el inicio de la base), llamados o no
let crmLeads = null;
function crmLeadsCargar() {
  if (crmLeads) return crmLeads;
  const L = (window.CRM || {}).leads, A = (window.DATOS || {}).asesoras || [];
  if (!L) return (crmLeads = []);
  const eqDe = new Map(A.map(a => [a.nombre, a.equipo]));
  crmLeads = L.filas.map(r => ({fecha: r[0], pipeline: L.pipelines[r[1]], etapa: L.etapas[r[2]], canal: L.canales[r[3]], dueno: L.duenos[r[4]],
    equipo: eqDe.get(L.duenos[r[4]]) || null, llamado: r[5], abierto: r[6], sin_tel: r[7], leads: r[8]}));
  return crmLeads;
}
// Pipelines que se muestran en la pestaña; las llamadas a leads de otros pipelines solo se cuentan aparte
const PIPELINES_CRM = ['Pregrado Barranquilla', 'Especializaciones'];
dash.calc('crm_filtro', {
  inputs: ['crm_todas'], title: 'Llamadas a leads de los pipelines elegidos o que no están en el CRM',
  fn: (t) => t.filter(r => r.pipeline == null || PIPELINES_CRM.includes(r.pipeline))
});
dash.calc('crm_todas', {
  inputs: [], title: 'Llamadas salientes cruzadas con el CRM, con los filtros aplicados',
  fn: () => {
    const p = dash.params();
    const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return crmCargar().filter(r =>
      (!p.desde || r.fecha >= p.desde) && (!p.hasta || r.fecha <= p.hasta) &&
      (!sem.length || sem.includes(semanaDe(r.fecha))) && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) &&
      (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.asesora)));
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
    pct_conect: div(conectadas, llamadas), pct_efec: div(efectivas, conectadas), efec_llamadas: div(efectivas, llamadas),
    pct_propias: div(propias, propias + ajenas + sin_dueno), por_lead: div(llamadas, nums.size), pct_leads_efec: div(numsEfec.size, nums.size)};
}
const enCrm = rows => rows.filter(r => r.pipeline != null);
function crmPor(rows, key) {
  return [...agrupar(rows, key)].map(([k, rs]) => ({[key]: k, ...medirCrm(rs)})).sort((a, b) => b.llamadas - a.llamadas);
}
dash.calc('crm_kpi', {
  inputs: ['crm_filtro', 'crm_todas'], title: 'Indicadores del cruce con el CRM',
  fn: (f, todas) => {
    const t = medirCrm(todas), c = enCrm(f), mc = medirCrm(c), no = medirCrm(f.filter(r => r.pipeline == null));
    const otros = medirCrm(todas.filter(r => r.pipeline != null && !PIPELINES_CRM.includes(r.pipeline)));
    const conAct = new Set(c.filter(r => r.activador !== '(sin activador)').map(r => r.num)).size;
    return [{llamadas: t.llamadas, en_crm: mc.llamadas, pct_en_crm: t.llamadas ? mc.llamadas / t.llamadas : null,
      llamadas_otros: otros.llamadas, numeros_otros: otros.numeros,
      numeros: t.numeros, numeros_crm: mc.numeros, numeros_no: no.numeros, llamadas_no: no.llamadas, conectadas_no: no.conectadas,
      propias: mc.propias, ajenas: mc.ajenas, sin_dueno: mc.sin_dueno, pct_propias: mc.pct_propias,
      numeros_activador: conAct, pct_activador: mc.numeros ? conAct / mc.numeros : null}];
  }
});
dash.calc('crm_pipelines', {inputs: ['crm_filtro'], title: 'Llamadas por pipeline', fn: f => crmPor(enCrm(f), 'pipeline')});
dash.calc('crm_canales', {inputs: ['crm_filtro'], title: 'Llamadas por canal', fn: f => crmPor(enCrm(f), 'canal')});
dash.calc('crm_etapas', {
  inputs: ['crm_filtro'], title: 'Llamadas por etapa actual del lead',
  fn: f => {
    const r = crmPor(enCrm(f), 'etapa'); const no = f.filter(x => x.pipeline == null);
    if (no.length) r.push({etapa: '(no está en el CRM)', ...medirCrm(no)});
    return r;
  }
});
dash.calc('crm_activadores', {inputs: ['crm_filtro'], title: 'Llamadas por activador', fn: f => crmPor(enCrm(f), 'activador')});
dash.calc('crm_propia', {
  inputs: ['crm_filtro'], title: 'Asesora que llama frente a propietaria en HubSpot',
  fn: f => [...agrupar(enCrm(f), 'asesora')].map(([a, rs]) => {
    const m = medirCrm(rs);
    return {asesora: a, equipo: rs[0].equipo, en_crm: m.llamadas, propias: m.propias, ajenas: m.ajenas, sin_dueno: m.sin_dueno, pct_propias: m.pct_propias};
  }).sort((a, b) => b.en_crm - a.en_crm)
});
dash.calc('crm_ajenas', {
  inputs: ['crm_filtro'], title: 'Resumen por asesora de las llamadas a leads de otra persona',
  fn: f => [...agrupar(f.filter(r => r.propia === 0), 'asesora')].map(([a, rs]) => ({asesora: a, equipo: rs[0].equipo,
    duenas: new Set(rs.map(r => r.dueno)).size, ...medirCrm(rs)})).sort((a, b) => b.numeros - a.numeros)
});
dash.calc('crm_activador_grupos', {
  inputs: ['crm_filtro'], title: 'Activador con el detalle de la actividad de ingreso de sus leads',
  fn: f => {
    // Los cursos y webinars con nombre propio se agrupan en "Evento"; las actividades con menos de 5 leads, en "Otras"
    const tipo = a => a && a.startsWith('Evento: ') ? 'Evento (cursos, webinars)' : (a || '(sin actividad)');
    return [...agrupar(enCrm(f), 'activador')].map(([act, rs]) => {
      const hijos = [], otras = [];
      for (const [actividad, hs] of agrupar(rs.map(r => Object.assign({}, r, {act_tipo: tipo(r.actividad)})), 'act_tipo')) {
        const m = medirCrm(hs);
        if (m.numeros >= 5) hijos.push({actividad, ...m}); else otras.push(...hs);
      }
      hijos.sort((a, b) => b.numeros - a.numeros);
      if (otras.length) hijos.push({actividad: 'Otras', ...medirCrm(otras)});
      return {activador: act, ...medirCrm(rs), hijos};
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
  const celda = (tr, i, texto, cls) => { const td = document.createElement('td'); if (etiquetas[i]) td.dataset.label = etiquetas[i]; if (cls) td.className = cls; td.appendChild(texto); tr.appendChild(td); return td; };
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
        const td = celda(tr, i, span(r[k] == null ? '—' : f(r[k])));
        if (conProm && typeof r[k] === 'number' && prom[i] != null && r[k] < prom[i] - 1e-9) td.classList.add('bajo');
      }
    });
    tb.appendChild(tr);
    if (exp) hijos.forEach(h => {
      const th = document.createElement('tr'); th.className = 'hijo';
      cols.forEach(([k, f], i) => celda(th, i, document.createTextNode(i === 0 ? h.nombre_hijo || h.actividad : (h[k] == null ? '—' : f(h[k])))));
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
      const m = medirCrm(v.filter(r => r.tramo === i));
      return {tramo: t, leads: m.llamadas, pct_leads: total ? m.llamadas / total : null, pct_conect: m.pct_conect, pct_efec_total: m.efec_llamadas};
    }).filter(r => r.leads > 0);
  }
});
dash.calc('crm_canal_rinde', {
  inputs: ['crm_filtro'], title: 'Rendimiento por canal',
  fn: f => crmPor(enCrm(f), 'canal').filter(r => r.numeros >= 30).sort((a, b) => (b.pct_leads_efec || 0) - (a.pct_leads_efec || 0))
});

/* Tablas */
dash.draw('t_crm_pipelines', tb => cuerpo(tb, 'crm_pipelines', [['pipeline', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['efectivas', n0], ['pct_conect', pc], ['pct_efec', pc]]));
dash.draw('t_crm_etapas', tb => { cuerpo(tb, 'crm_etapas', [['etapa', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_efec', pc]]); recortar(tb, 8); });
dash.draw('t_crm_activadores', tb => cuerpoGrupos(tb, 'crm_activador_grupos', [['activador', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_propias', pc]], 'hijos', 8));
dash.draw('t_crm_propia', tb => cuerpo(tb, 'crm_propia', [['asesora', S], ['equipo', S, 'eq'], ['en_crm', n0], ['propias', n0], ['ajenas', n0], ['sin_dueno', n0], ['pct_propias', pc]]));
dash.draw('t_crm_ajenas', tb => cuerpo(tb, 'crm_ajenas', [['asesora', S], ['equipo', S, 'eq'], ['numeros', n0], ['llamadas', n0], ['duenas', n0], ['conectadas', n0], ['efectivas', n0]]));dash.draw('t_crm_velocidad', tb => cuerpo(tb, 'crm_velocidad', [['tramo', S], ['leads', n0], ['pct_leads', pc], ['pct_conect', pc], ['pct_efec_total', pc]]));
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
    tip: [`${n0(r.numeros)} números`, `${n0(r.llamadas)} llamadas`, `${n0(r.conectadas)} conectadas`, `${n0(r.efectivas)} efectivas`]
  })), {aria, legend: [{name: 'Efectivas', color: A}, {name: 'Resto de las llamadas', color: MUT}]});
}
dash.draw('ch_crm_pipelines', el => barrasCrm(el, 'crm_pipelines', 'pipeline', 'Llamadas por pipeline'));
dash.draw('ch_crm_canales', el => barrasCrm(el, 'crm_canales', 'canal', 'Llamadas por canal'));

/* Textos */
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
dash.draw('crm_otros', el => {
  const g = dash.data('crm_kpi'); const k = g.status === 'ok' && g.data[0];
  el.textContent = k && k.llamadas_otros ? `${n0(k.llamadas_otros)} llamadas (${n0(k.numeros_otros)} números) fueron a leads de otros pipelines y no se muestran.` : '';
});
dash.draw('crm_no_texto', el => {
  const g = dash.data('crm_kpi'); const k = g.status === 'ok' && g.data[0];
  if (!k || !k.llamadas) { el.textContent = 'Sin llamadas para estos filtros.'; return; }
  if (!k.numeros_no) { el.textContent = 'Todos los números llamados con estos filtros aparecen en el CRM.'; return; }
  el.textContent = `${n0(k.numeros_no)} números (${n0(k.llamadas_no)} llamadas, ${n0(k.conectadas_no)} conectadas) no aparecen en el CRM con ningún formato del teléfono. ` +
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
const VER_POR = {asesora: 'Asesora que llama', canal: 'Canal', activador: 'Activador', programa: 'Programa académico', campana: 'Campaña (solo Internet)'};
document.querySelectorAll('#seg-resultado button').forEach(b => b.addEventListener('click', () => {
  const por = b.dataset.por;
  document.querySelectorAll('#seg-resultado button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  const th = document.querySelector('#crm-resultado th[data-field="grupo"]'); if (th) th.textContent = VER_POR[por];
  if (abiertos.t_crm_resultado) abiertos.t_crm_resultado.clear();
  dash.setParams({crm_por: por});
}));
dash.calc('crm_resultado_kpi', {inputs: ['crm_filtro'], title: 'Embudo de los leads llamados', fn: f => [medirResultado(enCrm(f))]});
dash.calc('crm_resultado', {
  inputs: ['crm_filtro'], title: 'Resultado de los leads llamados, por grupo',
  fn: f => {
    const k = dash.params().crm_por || 'asesora';
    let rs = enCrm(f);
    if (k === 'campana') rs = rs.filter(r => r.canal === 'Internet');
    return [...agrupar(rs, k)].map(([g, xs]) => ({grupo: g, ...medirResultado(xs)})).sort((a, b) => b.leads - a.leads);
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
  inputs: [], title: 'Leads creados en el periodo (por fecha de creación); los filtros de equipo y asesora se aplican a la propietaria',
  fn: () => {
    const p = dash.params();
    const sem = lista(p.semanas).map(Number), nuc = lista(p.nucleos).map(Number), eq = lista(p.equipos), as = lista(p.asesoras);
    return crmLeadsCargar().filter(r =>
      (!p.desde || r.fecha >= p.desde) && (!p.hasta || r.fecha <= p.hasta) &&
      (!sem.length || sem.includes(semanaDe(r.fecha))) && (!nuc.length || nuc.includes(nucleoDe(r.fecha))) &&
      (!eq.length || eq.includes(r.equipo)) && (!as.length || as.includes(r.dueno)));
  }
});
function medirLeads(rows) {
  const hoy = ((window.CRM || {}).sincronizado || '').slice(0, 10);
  let leads = 0, llamados = 0, pendientes = 0, viejos = 0;
  for (const r of rows) {
    leads += r.leads; if (r.llamado) llamados += r.leads;
    if (!r.llamado && r.abierto) { pendientes += r.leads; if (hoy && r.fecha < addDays(hoy, -3)) viejos += r.leads; }
  }
  return {leads, llamados, pct_llamados: leads ? llamados / leads : null, pendientes, viejos};
}
dash.calc('crm_leads_kpi', {inputs: ['crm_leads_filtro'], title: 'Cobertura de llamadas', fn: f => [medirLeads(f)]});
dash.calc('crm_leads_duenos', {
  inputs: ['crm_leads_filtro'], title: 'Leads sin llamar por propietaria, con el detalle por canal',
  fn: f => [...agrupar(f, 'dueno')].map(([d, rs]) => ({dueno: d, en_aircall: rs[0].equipo ? 'Sí' : 'No', ...medirLeads(rs),
    hijos: [...agrupar(rs, 'canal')].map(([c, xs]) => ({nombre_hijo: c, ...medirLeads(xs)})).filter(h => h.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes)}))
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
      if (!m.has(r.num)) m.set(r.num, {llamadas: 0, conectadas: 0, dueno: r.dueno || '(sin propietario)', etapa: r.etapa, canal: r.canal});
      const x = m.get(r.num); x.llamadas += r.llamadas; if (r.clase > 0) x.conectadas += r.llamadas;
    }
    return [...m.values()].filter(x => x.llamadas >= n && x.conectadas === 0);
  }
});
const medirSat = xs => { const ll = xs.reduce((s, x) => s + x.llamadas, 0); return {leads: xs.length, llamadas: ll, por_lead: xs.length ? ll / xs.length : null}; };
dash.calc('crm_saturados_kpi', {
  inputs: ['crm_saturados_base', 'crm_filtro'], title: 'Resumen de leads intentados demasiado',
  fn: (xs, f) => { const total = medirCrm(enCrm(f)).llamadas; const m = medirSat(xs); return [{...m, pct_llamadas: total ? m.llamadas / total : null}]; }
});
dash.calc('crm_saturados', {
  inputs: ['crm_saturados_base'], title: 'Leads intentados demasiado por propietaria, con el detalle por etapa',
  fn: xs => [...agrupar(xs, 'dueno')].map(([d, rs]) => ({dueno: d, ...medirSat(rs),
    hijos: [...agrupar(rs, 'etapa')].map(([e, ys]) => ({nombre_hijo: e, ...medirSat(ys)})).sort((a, b) => b.leads - a.leads)}))
    .sort((a, b) => b.leads - a.leads)
});
dash.draw('t_crm_saturados', tb => cuerpoGrupos(tb, 'crm_saturados', [['dueno', S], ['leads', n0], ['llamadas', n0], ['por_lead', n1]], 'hijos', 10, ['etapa', 'etapas']));
dash.draw('crm_saturados_nota', el => {
  const g = dash.data('crm_saturados_kpi'); const k = g.status === 'ok' && g.data[0];
  const n = dash.params().crm_sat || 6;
  if (!k || !k.leads) { el.textContent = `Ningún lead recibió ${n} llamadas o más sin conectarse con estos filtros.`; return; }
  el.textContent = `${n0(k.leads)} leads recibieron ${n} llamadas o más en el periodo y ninguna se conectó: son ${n0(k.llamadas)} llamadas, el ${pc(k.pct_llamadas)} de las llamadas a estos pipelines. ` +
    'Conviene decidir si se cierran, se intentan por WhatsApp o correo, o se revisa si el número está bien.';
});

textDraw('n1', n1);
// Los selectores de la pestaña siguen a los filtros (por ejemplo, al usar "Limpiar filtros")
dash.onData(() => {
  const p = dash.params(), por = p.crm_por || 'asesora', sat = String(p.crm_sat || 6);
  document.querySelectorAll('#seg-resultado button').forEach(x => x.setAttribute('aria-pressed', x.dataset.por === por ? 'true' : 'false'));
  document.querySelectorAll('#seg-saturados button').forEach(x => x.setAttribute('aria-pressed', x.dataset.n === sat ? 'true' : 'false'));
  const th = document.querySelector('#crm-resultado th[data-field="grupo"]'); if (th) th.textContent = VER_POR[por];
});
