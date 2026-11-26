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
    dueno: de(C.duenos, r[8]), propia: r[9], tramo: r[10], actividad: de(C.actividades || [], r[11]), llamadas: r[12]}));
  return crmFilas;
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
dash.calc('crm_act_actividad', {
  inputs: ['crm_filtro'], title: 'Activador y actividad de ingreso de los leads',
  fn: f => {
    // Los cursos y webinars con nombre propio se agrupan en "Evento"; las actividades con menos de 5 leads, en "Otras"
    const tipo = a => a && a.startsWith('Evento: ') ? 'Evento (cursos, webinars)' : a;
    const c = enCrm(f).filter(r => r.activador !== '(sin activador)');
    const totalAct = new Map([...agrupar(c, 'activador')].map(([a, rs]) => [a, new Set(rs.map(r => r.num)).size]));
    const m = new Map();
    for (const r of c) { const k = r.activador + '|' + tipo(r.actividad); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    const filas = [], otras = new Map();
    for (const rs of m.values()) {
      const fila = {activador: rs[0].activador, actividad: tipo(rs[0].actividad), ...medirCrm(rs)};
      if (fila.numeros >= 5) filas.push(fila);
      else { if (!otras.has(fila.activador)) otras.set(fila.activador, []); otras.get(fila.activador).push(...rs); }
    }
    for (const [a, rs] of otras) filas.push({activador: a, actividad: 'Otras', ...medirCrm(rs)});
    return filas.sort((a, b) => (totalAct.get(b.activador) - totalAct.get(a.activador)) || a.activador.localeCompare(b.activador, 'es') ||
      (a.actividad === 'Otras') - (b.actividad === 'Otras') || b.numeros - a.numeros);
  }
});
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
dash.draw('t_crm_etapas', tb => cuerpo(tb, 'crm_etapas', [['etapa', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_efec', pc]]));
dash.draw('t_crm_activadores', tb => cuerpo(tb, 'crm_activadores', [['activador', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0], ['pct_propias', pc]]));
dash.draw('t_crm_propia', tb => cuerpo(tb, 'crm_propia', [['asesora', S], ['equipo', S, 'eq'], ['en_crm', n0], ['propias', n0], ['ajenas', n0], ['sin_dueno', n0], ['pct_propias', pc]]));
dash.draw('t_crm_ajenas', tb => cuerpo(tb, 'crm_ajenas', [['asesora', S], ['equipo', S, 'eq'], ['numeros', n0], ['llamadas', n0], ['duenas', n0], ['conectadas', n0], ['efectivas', n0]]));
dash.draw('t_crm_act_actividad', tb => cuerpo(tb, 'crm_act_actividad', [['activador', S], ['actividad', S], ['numeros', n0], ['llamadas', n0], ['conectadas', n0], ['pct_conect', pc], ['efectivas', n0]]));
dash.draw('t_crm_velocidad', tb => cuerpo(tb, 'crm_velocidad', [['tramo', S], ['leads', n0], ['pct_leads', pc], ['pct_conect', pc], ['pct_efec_total', pc]]));
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
