"""
Cruce de las llamadas de Aircall con el CRM (copia de HubSpot en Azure SQL).

Lo usa actualizar_datos.py; no hace falta correrlo aparte. Necesita la skill crm-ceipa
instalada en este computador (scripts/crm.ps1) y el código personal de acceso ya configurado.

Archivos locales (todos en .gitignore, nunca se suben):
  crm_indice.csv.gz        negocio -> teléfono cifrado, de todos los negocios con celular
  crm_detalle.csv.gz       pipeline, etapa, canal, activador y propietario de los negocios llamados
  crm_estado.json          fecha de la última sincronización
  crm_no_encontrados.csv   números llamados que no aparecen en el CRM (con el número real)
Archivo público:
  crm.js                   cifras agregadas para la pestaña CRM, sin teléfonos ni nombres de clientes

La primera vez trae el índice completo de teléfonos (una consulta media, ~780 mil filas de dos
columnas). Después solo trae los negocios modificados desde la última sincronización.
"""
import datetime as dt
import glob
import hashlib
import json
import os
import re
import subprocess
import time

import pandas as pd

CARPETA = os.path.dirname(os.path.abspath(__file__))
INDICE = os.path.join(CARPETA, 'crm_indice.csv.gz')
DETALLE = os.path.join(CARPETA, 'crm_detalle.csv.gz')
ESTADO = os.path.join(CARPETA, 'crm_estado.json')
NO_ENCONTRADOS = os.path.join(CARPETA, 'crm_no_encontrados.csv')
TMP = os.path.join(CARPETA, '.crm_tmp')
SALIDA = os.path.join(CARPETA, 'crm.js')

INICIO_BASE = pd.Timestamp('2026-10-13')  # primer día con llamadas en la base
# Nombres que no coinciden entre Aircall y HubSpot ni quitando tildes ni palabras de más
ALIAS = {'Lileth Cantillo': 'Lilieth Cantillo Acuña'}
CARGA_MASIVA = 300  # leads llamados creados el mismo día: más que esto es una carga masiva, no leads nuevos
TRAMOS = ['Menos de 1 hora', '1 a 4 horas', '4 a 24 horas', '1 a 3 días', 'Más de 3 días']


# ---------- Teléfonos ----------
def normalizar_tel(tel):
    """Deja solo los dígitos con indicativo: '+57 300 123 4567', '3001234567' y '573001234567' quedan iguales."""
    if tel is None or (isinstance(tel, float) and pd.isna(tel)):
        return ''
    s = str(tel).strip()
    partes = s.split('-')
    if len(re.sub(r'\D', '', partes[0])) >= 10:  # '+573001234567-12': lo de después del guion es extensión
        s = partes[0]
    d = re.sub(r'\D', '', s)
    if len(d) == 10 and d[0] in '36':  # celular o fijo colombiano sin indicativo
        d = '57' + d
    return d


def cifrar(tel):
    d = normalizar_tel(tel)
    return hashlib.sha256(d.encode('utf-8')).hexdigest()[:20] if d else ''


# ---------- Consultas al CRM ----------
def _ruta_crm_ps1():
    if os.environ.get('CRM_PS1') and os.path.exists(os.environ['CRM_PS1']):
        return os.environ['CRM_PS1']
    base = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Claude-Data')
    hallados = glob.glob(os.path.join(base, '*', 'local-agent-mode-sessions', 'skills-plugin', '*', '*', 'skills', 'crm-ceipa', 'scripts', 'crm.ps1'))
    if not hallados:
        hallados = glob.glob(os.path.join(base, '**', 'crm-ceipa', 'scripts', 'crm.ps1'), recursive=True)
    if not hallados:
        raise RuntimeError('No encontré la skill crm-ceipa (scripts/crm.ps1). Define la variable CRM_PS1 con su ruta.')
    return max(hallados, key=os.path.getmtime)


def _ps(args):
    cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', _ruta_crm_ps1()] + args
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def consultar(sql, nombre, max_filas=100000):
    """Corre una consulta con crm.ps1 (habilita la IP si hace falta) y devuelve un DataFrame de texto."""
    os.makedirs(TMP, exist_ok=True)
    ruta_sql = os.path.join(TMP, nombre + '.sql')
    ruta_csv = os.path.join(TMP, nombre + '.csv')
    with open(ruta_sql, 'w', encoding='utf-8') as fh:
        fh.write(sql)
    try:
        for intento in range(8):
            if os.path.exists(ruta_csv):
                os.remove(ruta_csv)
            rc, out = _ps(['consulta', '-Archivo', ruta_sql, '-Salida', ruta_csv, '-Mostrar', '0',
                           '-MaxFilas', str(max_filas), '-Timeout', '300'])
            if rc == 0:
                if not os.path.exists(ruta_csv):
                    return pd.DataFrame()
                return pd.read_csv(ruta_csv, dtype=str, encoding='utf-8-sig', keep_default_na=False).replace({'': None})
            if rc == 3:  # la red tiene más de una salida a internet: habilitar y reintentar
                _ps(['habilitar'])
                continue
            if rc == 4:  # otra consulta en curso
                time.sleep(15)
                continue
            raise RuntimeError(f'La consulta {nombre} no se ejecutó (código {rc}):\n{out.strip()}')
        raise RuntimeError(f'La consulta {nombre} no pudo conectarse: la base sigue rechazando la IP de esta red.')
    finally:
        for p in (ruta_sql, ruta_csv):
            if os.path.exists(p):
                os.remove(p)


def _fecha_sql(ts):
    return ts.strftime('%Y-%m-%dT%H:%M:%S')


SQL_DETALLE = '''SELECT d.hs_object_id AS id, p.PipelineLabel AS pipeline, s.StageLabel AS etapa,
       CAST(LEFT(d.canal__n_, 100) AS nvarchar(100)) AS canal,
       CAST(LEFT(d.activador__n_, 100) AS nvarchar(100)) AS activador,
       CAST(LEFT(d.tipo_de_programa__n_, 100) AS nvarchar(100)) AS tipo_programa,
       CAST(LEFT(d.origen_del_lead__n_, 100) AS nvarchar(100)) AS origen,
       CAST(LEFT(d.evento__n_, 150) AS nvarchar(150)) AS evento,
       CAST(LEFT(d.programa_academico__n_, 150) AS nvarchar(150)) AS programa,
       CAST(LEFT(d.utm_campaign_del__n_, 120) AS nvarchar(120)) AS campana,
       d.fecha_contactado, d.fecha_cita_total, d.fecha_inscripcion, d.fecha_ne,
       LTRIM(RTRIM(CONCAT(o.FirstName, ' ', o.LastName))) AS propietario,
       d.createdate
FROM dbo.Deal AS d
LEFT JOIN dbo.DealPipeline AS p ON p.PipelineId = d.pipeline
LEFT JOIN dbo.DealPipelineStage AS s ON s.PipelineId = d.pipeline AND s.DealStage = d.dealstage
LEFT JOIN dbo.Owner AS o ON o.hubspot_owner_id = TRY_CAST(d.hubspot_owner_id AS BIGINT)
WHERE d.hs_object_id IN ({ids});
'''


PIPELINES_IDS = {'Pregrado Barranquilla': '8405051', 'Especializaciones': '8407014'}
SQL_LEADS = '''SELECT d.hs_object_id AS id, CAST(LEFT(d.numero_de_telefono_movil__n_, 30) AS varchar(30)) AS tel,
       p.PipelineLabel AS pipeline, s.StageLabel AS etapa,
       CAST(LEFT(d.canal__n_, 100) AS nvarchar(100)) AS canal,
       LTRIM(RTRIM(CONCAT(o.FirstName, ' ', o.LastName))) AS propietario,
       d.createdate
FROM dbo.Deal AS d
JOIN dbo.DealPipeline AS p ON p.PipelineId = d.pipeline
LEFT JOIN dbo.DealPipelineStage AS s ON s.PipelineId = d.pipeline AND s.DealStage = d.dealstage
LEFT JOIN dbo.Owner AS o ON o.hubspot_owner_id = TRY_CAST(d.hubspot_owner_id AS BIGINT)
WHERE d.pipeline IN ({pipelines}) AND d._archived = 0 AND d.createdate >= '{desde}';
'''
# Etapas cerradas o ya avanzadas: un lead en ellas no queda como "pendiente de llamar"
ETAPAS_CERRADAS = {'Anulado', 'Desertado', 'Matriculado', 'Facturado', 'Inscrito', 'Otro Periodo', 'Devolución'}
SATURADO = 6  # llamadas sin ninguna conectada para considerar un lead "intentado demasiado" en la lista local
LEADS_SIN_LLAMAR = os.path.join(CARPETA, 'crm_leads_sin_llamar.csv')
LEADS_SATURADOS = os.path.join(CARPETA, 'crm_leads_saturados.csv')


def sincronizar(hashes_llamados):
    """Actualiza el índice de teléfonos y el detalle de los negocios llamados. Devuelve (indice, detalle, fecha)."""
    estado = json.load(open(ESTADO, encoding='utf-8')) if os.path.exists(ESTADO) else {}
    ahora = pd.Timestamp.now(tz='UTC').tz_localize(None)
    modificados = set()

    if not os.path.exists(INDICE) or 'sincronizado_utc' not in estado:
        print('CRM: primera carga, traigo el índice completo de teléfonos (puede tardar un par de minutos)...')
        q = consultar('''SELECT hs_object_id AS id, CAST(LEFT(numero_de_telefono_movil__n_, 30) AS varchar(30)) AS tel
FROM dbo.Deal
WHERE numero_de_telefono_movil__n_ IS NOT NULL AND _archived = 0;
''', 'indice', max_filas=2000000)
        indice = pd.DataFrame({'id': q['id'], 'hash': q['tel'].map(cifrar)})
        indice = indice[indice.hash != '']
        detalle = pd.DataFrame(columns=['id'])
    else:
        indice = pd.read_csv(INDICE, dtype=str)
        detalle = pd.read_csv(DETALLE, dtype=str) if os.path.exists(DETALLE) else pd.DataFrame(columns=['id'])
        if 'campana' not in detalle.columns:  # detalle de una versión anterior: se vuelve a traer completo
            detalle = pd.DataFrame(columns=['id'])
        desde = pd.Timestamp(estado['sincronizado_utc']) - pd.Timedelta(hours=6)  # margen por la copia nocturna
        q = consultar(f'''SELECT hs_object_id AS id, CAST(LEFT(numero_de_telefono_movil__n_, 30) AS varchar(30)) AS tel,
       CAST(_archived AS int) AS borrado
FROM dbo.Deal
WHERE hs_lastmodifieddate >= '{_fecha_sql(desde)}' OR _archived_at >= '{_fecha_sql(desde)}';
''', 'modificados', max_filas=500000)
        modificados = set(q['id']) if len(q) else set()
        indice = indice[~indice.id.isin(modificados)]
        if len(q):
            vivos = q[(q.borrado != '1') & q.tel.notna()]
            nuevo = pd.DataFrame({'id': vivos['id'], 'hash': vivos['tel'].map(cifrar)})
            indice = pd.concat([indice, nuevo[nuevo.hash != '']], ignore_index=True)
        detalle = detalle[~detalle.id.isin(modificados)]
        print(f'CRM: {len(modificados)} negocios modificados desde la última sincronización.')

    necesarios = set(indice[indice.hash.isin(hashes_llamados)].id)
    faltan = sorted(necesarios - set(detalle.id))
    partes = [detalle[detalle.id.isin(necesarios)]]
    for i in range(0, len(faltan), 2000):  # por llave: livianas aunque sean varias
        lote = faltan[i:i + 2000]
        partes.append(consultar(SQL_DETALLE.format(ids=','.join(lote)), f'detalle_{i // 2000}'))
    detalle = pd.concat(partes, ignore_index=True).drop_duplicates('id', keep='last')

    # Todos los leads de los pipelines del panel creados desde el inicio de la base, para ver cuáles nadie ha llamado
    leads = consultar(SQL_LEADS.format(pipelines=','.join(f"'{p}'" for p in PIPELINES_IDS.values()),
                                       desde=_fecha_sql(INICIO_BASE + pd.Timedelta(hours=5))), 'leads_pipelines')
    leads['hash'] = leads.tel.map(cifrar)
    leads = leads.drop(columns='tel')

    indice.to_csv(INDICE, index=False, compression='gzip')
    detalle.to_csv(DETALLE, index=False, compression='gzip')
    estado['sincronizado_utc'] = ahora.isoformat()
    json.dump(estado, open(ESTADO, 'w', encoding='utf-8'))
    print(f'CRM: {len(indice)} negocios con celular en el índice; detalle de {len(detalle)} negocios llamados; '
          f'{len(leads)} leads de {" y ".join(PIPELINES_IDS)} creados desde el {INICIO_BASE:%d-%m}.')
    return indice, detalle, ahora, leads


# ---------- Cruce y archivo para el panel ----------
def _limpio(s, vacio):
    s = s.fillna('').astype(str).str.replace(r'\s+', ' ', regex=True).str.strip()
    return s.where(s != '', vacio)


def _sin_tildes(s):
    import unicodedata
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().split()


def _misma_persona(aircall, hubspot):
    if not isinstance(hubspot, str) or not hubspot:
        return False
    if ALIAS.get(aircall) == hubspot:
        return True
    a, h = set(_sin_tildes(aircall)), set(_sin_tildes(hubspot))
    return bool(a) and bool(h) and (a <= h or h <= a)


def _arreglar_texto(s):
    """Corrige textos de HubSpot leídos con la codificación equivocada (p. ej. 'Ingenier铆a' -> 'Ingeniería')."""
    if isinstance(s, str) and any('一' <= ch <= '鿿' for ch in s):
        try:
            return s.encode('gbk').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def _categoria(serie, vacio, minusculas=False):
    """Une variantes de un mismo texto (mayúsculas, tildes, espacios) y muestra la forma más usada."""
    limpio = _limpio(serie.map(_arreglar_texto), '')
    clave = limpio.map(lambda s: ' '.join(_sin_tildes(s)))
    def mejor(vs):
        cuenta = vs.value_counts()
        if minusculas:
            return cuenta.index[0]
        bonitas = [v for v in cuenta.index if not v.isupper() and not v.islower()]  # con mayúscula inicial y tildes
        v = bonitas[0] if bonitas else cuenta.index[0]
        return v if not (v.isupper() or v.islower()) else v[:1].upper() + v[1:].lower()
    nombres = {k: mejor(vs) for k, vs in limpio[clave != ''].groupby(clave[clave != ''])}
    return clave.map(nombres).fillna(vacio)


def construir(llamadas, asesoras, indice, detalle, sincronizado, leads, numeros_reales=None):
    """llamadas: salientes ya filtradas (columnas t, f, user, c, customer number cifrado)."""
    det = detalle.copy()
    det['pipeline'] = _limpio(det.pipeline, '(sin pipeline)')
    det['etapa'] = _limpio(det.etapa, '(sin etapa)')
    det['canal'] = _limpio(det.canal, '(sin canal)')
    det['activador'] = _limpio(det.activador, '(sin activador)')
    det['tipo_programa'] = _limpio(det.tipo_programa, '(sin tipo)')
    det['propietario'] = _limpio(det.propietario, '(sin propietario)')
    # Actividad de ingreso: el origen del lead (Stand, Charla presencial, Ferias...); si no tiene, el nombre del evento
    origen, evento = _limpio(det.origen, ''), _limpio(det.evento, '')
    det['actividad'] = origen.where(origen != '', ('Evento: ' + evento).where(evento != '', '(sin actividad)'))
    det['programa'] = _categoria(det.programa, '(sin programa)')
    det['campana'] = _categoria(det.campana, '(sin campaña)', minusculas=True)
    # Hitos que el lead tiene hoy en HubSpot: 1 contactado, 2 cita, 4 inscripción, 8 matrícula
    det['hitos'] = sum(det[c].notna().astype(int) * b for c, b in
                       [('fecha_contactado', 1), ('fecha_cita_total', 2), ('fecha_inscripcion', 4), ('fecha_ne', 8)])
    det['creado'] = pd.to_datetime(det.createdate, errors='coerce') - pd.Timedelta(hours=5)  # UTC -> Colombia
    det['activo'] = ~det.pipeline.str.startswith('Archivo')
    neg = indice.merge(det, on='id')
    # Un negocio por número: primero los activos, y entre ellos el más reciente
    neg = neg.sort_values(['activo', 'creado'], ascending=[False, False]).drop_duplicates('hash')

    ll = llamadas[['t', 'f', 'user', 'c', 'customer number']].rename(columns={'customer number': 'hash'}).copy()
    ll = ll.sort_values('t').reset_index(drop=True)
    ll = ll.merge(neg[['hash', 'id', 'pipeline', 'etapa', 'canal', 'activador', 'actividad', 'programa', 'campana', 'hitos',
                       'propietario', 'creado']], on='hash', how='left')
    ll['en_crm'] = ll.pipeline.notna()
    ll['hitos'] = ll.hitos.fillna(0).astype(int)

    # Propietaria: el nombre de HubSpot se muestra como en Aircall cuando es la misma asesora
    nombres = sorted(ll.user.unique())
    def dueno_visible(h):
        if not isinstance(h, str):
            return None
        for a in nombres:
            if _misma_persona(a, h):
                return a
        return h
    duenos = {h: dueno_visible(h) for h in ll.propietario.dropna().unique()}
    ll['dueno'] = ll.propietario.map(duenos)
    ll['propia'] = -1
    ll.loc[ll.en_crm, 'propia'] = 0
    ll.loc[ll.en_crm & (ll.dueno == ll.user), 'propia'] = 1
    ll.loc[ll.en_crm & (ll.propietario == '(sin propietario)'), 'propia'] = 2

    # Velocidad: primera llamada a un lead nuevo. Cuenta solo leads creados dentro de la base, que no
    # vienen de una carga masiva (días con más de CARGA_MASIVA leads llamados creados, como el cambio
    # de periodo) y que no se habían llamado antes de existir en HubSpot.
    ll['tramo'] = -1
    primera_vez = ll.groupby('hash').t.transform('min')
    por_dia = ll[ll.en_crm].drop_duplicates('hash').creado.dt.date.value_counts()
    masivos = set(por_dia[por_dia > CARGA_MASIVA].index)
    cand = ll[ll.en_crm & (ll.creado >= INICIO_BASE) & (primera_vez >= ll.creado) & ~ll.creado.dt.date.isin(masivos)]
    primeras = cand.groupby('hash').t.idxmin()
    horas = (ll.loc[primeras, 't'] - ll.loc[primeras, 'creado']).dt.total_seconds() / 3600
    ll.loc[primeras, 'tramo'] = pd.cut(horas, [-1, 1, 4, 24, 72, 1e9], labels=False, right=False).astype(int)

    ll['num'] = pd.factorize(ll.hash)[0]
    dims = {}
    def cod(col, vacio=-1):
        vals = ll[col].dropna()
        orden = vals.value_counts().index.tolist()
        dims[col] = orden
        m = {v: k for k, v in enumerate(orden)}
        return ll[col].map(m).fillna(vacio).astype(int)
    for col in ['pipeline', 'etapa', 'canal', 'activador', 'dueno', 'actividad', 'programa', 'campana']:
        ll[col + '_i'] = cod(col)
    ai = {a: k for k, a in enumerate(asesoras)}
    ll['ai'] = ll.user.map(ai)
    ll['ci'] = ll.c.map({'no': 0, 'auto': 1, 'efec': 2})
    cols = ['f', 'ai', 'ci', 'num', 'pipeline_i', 'etapa_i', 'canal_i', 'activador_i', 'dueno_i', 'propia', 'tramo', 'actividad_i',
            'programa_i', 'campana_i', 'hitos']
    g = ll.groupby(cols).size().reset_index(name='n')

    # Leads de los pipelines del panel que nadie ha llamado (ninguna llamada saliente al número)
    lds = leads.copy()
    lds['creado'] = pd.to_datetime(lds.createdate, errors='coerce') - pd.Timedelta(hours=5)
    lds['etapa'] = _limpio(lds.etapa, '(sin etapa)')
    lds['canal'] = _limpio(lds.canal, '(sin canal)')
    lds['propietario'] = _limpio(lds.propietario, '(sin propietario)')
    lds['dueno'] = lds.propietario.map(lambda h: dueno_visible(h) if h != '(sin propietario)' else h)
    llamados = set(ll.hash)
    lds['sin_tel'] = (lds.hash == '').astype(int)
    lds['llamado'] = lds.hash.isin(llamados).astype(int)
    lds['abierto'] = (~lds.etapa.isin(ETAPAS_CERRADAS)).astype(int)
    lds['fc'] = lds.creado.dt.strftime('%Y-%m-%d')
    ldims = {}
    for col in ['pipeline', 'etapa', 'canal', 'dueno']:
        orden = lds[col].value_counts().index.tolist(); ldims[col] = orden
        lds[col + '_i'] = lds[col].map({v: k for k, v in enumerate(orden)})
    lcols = ['fc', 'pipeline_i', 'etapa_i', 'canal_i', 'dueno_i', 'llamado', 'abierto', 'sin_tel']
    lg = lds.groupby(lcols).size().reset_index(name='n')

    local = sincronizado - pd.Timedelta(hours=5)
    datos = {
        'sincronizado': local.strftime('%Y-%m-%d %H:%M'),
        'columnas': cols + ['llamadas'],
        'pipelines': dims['pipeline'], 'etapas': dims['etapa'], 'canales': dims['canal'],
        'activadores': dims['activador'], 'duenos': dims['dueno'], 'actividades': dims['actividad'],
        'programas': dims['programa'], 'campanas': dims['campana'],
        'tramos': TRAMOS, 'cargas_masivas': sorted(str(d) for d in masivos if pd.Timestamp(d) >= INICIO_BASE),
        'filas': g.values.tolist(),
        'leads': {'columnas': lcols + ['leads'], 'pipelines': ldims['pipeline'], 'etapas': ldims['etapa'],
                  'canales': ldims['canal'], 'duenos': ldims['dueno'], 'filas': lg.values.tolist()},
    }
    with open(SALIDA, 'w', encoding='utf-8') as fh:
        fh.write('/* Cruce de llamadas con el CRM, agregado. Sin teléfonos ni nombres de clientes. */\nwindow.CRM = ')
        fh.write(json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
        fh.write(';\n')

    # Números que no aparecen: lista local con el número real (solo de los Excel cargados alguna vez)
    no = ll[~ll.en_crm].groupby('hash').agg(llamadas=('t', 'size'), primera=('t', 'min'), ultima=('t', 'max'),
                                             asesoras=('user', lambda s: ', '.join(sorted(s.unique()))))
    previos = pd.read_csv(NO_ENCONTRADOS, dtype=str) if os.path.exists(NO_ENCONTRADOS) else pd.DataFrame(columns=['numero'])
    reales = {cifrar(n): n for n in previos.numero.dropna()}
    reales.update(numeros_reales or {})
    no = no.reset_index()
    no['numero'] = no.hash.map(reales)
    no = no.drop(columns='hash').sort_values('ultima', ascending=False)
    no[['numero', 'llamadas', 'primera', 'ultima', 'asesoras']].to_csv(NO_ENCONTRADOS, index=False, encoding='utf-8-sig')

    # Listas locales para trabajar en HubSpot (por ID de negocio; sin teléfonos ni nombres de clientes)
    pend = lds[(lds.llamado == 0) & (lds.abierto == 1)].copy()
    pend['dias_esperando'] = (local.normalize() - pend.creado.dt.normalize()).dt.days
    pend['sin_telefono'] = pend.sin_tel.map({1: 'sí', 0: ''})
    pend.sort_values('creado')[['id', 'pipeline', 'etapa', 'canal', 'propietario', 'creado', 'dias_esperando', 'sin_telefono']] \
        .to_csv(LEADS_SIN_LLAMAR, index=False, encoding='utf-8-sig')
    por_num = ll[ll.en_crm].groupby('hash').agg(id=('id', 'first'), pipeline=('pipeline', 'first'), etapa=('etapa', 'first'),
                                                canal=('canal', 'first'), propietario=('propietario', 'first'),
                                                llamadas=('t', 'size'), conectadas=('c', lambda s: int((s != 'no').sum())),
                                                primera=('t', 'min'), ultima=('t', 'max'),
                                                asesoras=('user', lambda s: ', '.join(sorted(s.unique()))))
    sat = por_num[(por_num.llamadas >= SATURADO) & (por_num.conectadas == 0)].sort_values('llamadas', ascending=False)
    sat.drop(columns='conectadas').to_csv(LEADS_SATURADOS, index=False, encoding='utf-8-sig')
    print(f'CRM: {len(pend)} leads abiertos sin ninguna llamada ({os.path.basename(LEADS_SIN_LLAMAR)}); '
          f'{len(sat)} leads con {SATURADO}+ llamadas y ninguna conectada ({os.path.basename(LEADS_SATURADOS)}).')

    en = ll.en_crm.mean() if len(ll) else 0
    print(f'CRM: {ll.en_crm.sum()} de {len(ll)} llamadas salientes ({en:.1%}) van a números del CRM; '
          f'{len(no)} números no aparecen (lista en {os.path.basename(NO_ENCONTRADOS)}) -> {SALIDA}')
