"""
Actualiza datos.js con una o varias exportaciones de Aircall.

Uso:
    pip install pandas openpyxl
    python actualizar_datos.py exportacion_grande.xlsx dia_24.xlsx dia_25.xlsx ...

Une los archivos nuevos al historial acumulado (historial_llamadas.csv.gz, local y fuera
de GitHub), quita las llamadas repetidas (mismo "call id") y genera datos.js en la misma
carpeta. Luego sube datos.js a GitHub.
Cada día basta con pasar el Excel nuevo: lo anterior ya está en el historial. Si el historial
se pierde, vuelve a pasar todos los Excel de una vez y se reconstruye.

Después cruza las llamadas salientes con el CRM y genera crm.js (pestaña CRM). Para eso usa
la skill crm-ceipa de este computador; si el CRM no responde, datos.js se actualiza igual y
crm.js queda como estaba. Con --sin-crm se salta el cruce.

Reglas: conectada = answered Yes; efectiva = conectada con cualquier etiqueta que diga
"Contactado" (incluye "no puede hablar" y "familiar"), sin importar la duración.
Posgrados: Lina Beleno y Ana Isabel Zambrano Avendano; el resto, Pregrados.
No se incluye a quien esté en EXCLUIR (por ejemplo, coordinadoras).
"""
import json, sys, os
import pandas as pd
import crm_sync
from crm_sync import cifrar  # mismo cifrado para Aircall y el CRM: solo dígitos con indicativo

POSGRADOS = {'Lina Beleno', 'Ana Isabel Zambrano Avendano'}
EXCLUIR = {'Bleidys Torres', 'Karina Hernandez'}  # no entran en los reportes


CARPETA = os.path.dirname(os.path.abspath(__file__))
# Historial acumulado de todas las llamadas cargadas. Es local: está en .gitignore y no se sube.
# Guarda solo las columnas que usa el panel y el número del cliente cifrado (sha256).
HISTORIAL = os.path.join(CARPETA, 'historial_llamadas.csv.gz')
COLUMNAS = ['call id (internal)', 'call start time', 'answered', 'tags', 'direction', 'user', 'customer number']


NUMEROS_REALES = {}  # cifrado -> número real, solo de los Excel de esta corrida (para la lista local de no encontrados)


def leer_excel(path):
    df = pd.read_excel(path, dtype={'customer number': str})[COLUMNAS].copy()
    for n in df['customer number'].dropna().unique():
        NUMEROS_REALES[cifrar(n)] = n
    df['customer number'] = df['customer number'].map(cifrar)
    df['call id (internal)'] = df['call id (internal)'].astype(str)
    df['call start time'] = pd.to_datetime(df['call start time']).dt.strftime('%Y-%m-%d %H:%M:%S')
    return df


def leer(paths):
    partes = []
    if os.path.exists(HISTORIAL):
        partes.append(pd.read_csv(HISTORIAL, dtype=str, keep_default_na=False).replace({'': None}))
    partes += [leer_excel(p) for p in paths]
    df = pd.concat(partes, ignore_index=True)
    antes = len(df)
    df = df.drop_duplicates(subset='call id (internal)', keep='last').reset_index(drop=True)
    repetidas = antes - len(df)
    df.to_csv(HISTORIAL, index=False, compression='gzip')
    excluidas = int(df.user.isin(EXCLUIR).sum())
    df = df[~df.user.isin(EXCLUIR)].copy()
    return df, repetidas, excluidas


def construir(df):
    df['t'] = pd.to_datetime(df['call start time'])
    df = df.sort_values(['t', 'call id (internal)']).reset_index(drop=True)
    df['y'] = df.answered.eq('Yes')
    tg = df.tags.fillna('')
    eff = df.y & tg.str.contains('Contactado')
    df['c'] = 'no'; df.loc[df.y, 'c'] = 'auto'; df.loc[eff, 'c'] = 'efec'
    def tip(t):
        p = [x.strip() for x in str(t).split(',') if x.strip() and x.strip() != 'Local Presence']
        return p[0] if p else 'Solo Local Presence'
    df['tip'] = tg.map(tip)
    o = df.direction.eq('outbound')
    df['i'] = 0; df['p'] = 0
    oo = df[o].copy()
    oo['i'] = oo.groupby('customer number').cumcount() + 1
    prev = oo.groupby('customer number')['y'].cumsum() - oo['y'].astype(int)
    oo['p'] = (oo.y & (prev == 0)).astype(int)
    df.loc[o, 'i'] = oo['i'].clip(upper=5); df.loc[o, 'p'] = oo['p']
    df['f'] = df.t.dt.strftime('%Y-%m-%d'); df['h'] = df.t.dt.hour
    df['d'] = df.direction.map({'outbound': 's', 'inbound': 'e'})
    asesoras = sorted(df.user.unique()); tips = df.tip.value_counts().index.tolist()
    df['ai'] = df.user.map({a: k for k, a in enumerate(asesoras)}); df['ti'] = df.tip.map({t: k for k, t in enumerate(tips)})
    g = df.groupby(['f', 'h', 'ai', 'd', 'c', 'ti', 'i', 'p']).size().reset_index(name='n')
    datos = {'columnas': ['fecha', 'hora', 'asesora', 'direccion', 'clase', 'tipificacion', 'intento', 'primer_contacto', 'llamadas'],
             'asesoras': [{'nombre': a, 'equipo': ('Posgrados' if a in POSGRADOS else 'Pregrados')} for a in asesoras],
             'tipificaciones': tips,
             'filas': g[['f', 'h', 'ai', 'd', 'c', 'ti', 'i', 'p', 'n']].values.tolist()}
    return datos, df


def cruzar_crm(datos, df):
    salientes = df[df.d == 's']
    try:
        indice, detalle, cuando, leads = crm_sync.sincronizar(set(salientes['customer number']))
        crm_sync.construir(salientes, [a['nombre'] for a in datos['asesoras']], indice, detalle, cuando, leads, NUMEROS_REALES)
    except Exception as e:  # el panel de llamadas no depende del CRM
        print(f'\nAVISO: no se pudo cruzar con el CRM; crm.js queda como estaba.\n{e}')


def main(paths, out, con_crm=True):
    df, repetidas, excluidas = leer(paths)
    datos, df = construir(df)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write('/* Datos del panel: llamadas de Aircall agrupadas. Sin números de clientes. */\nwindow.DATOS = ')
        fh.write(json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
        fh.write(';\n')
    print(f'Listo: {len(df)} llamadas, del {df.f.min()} al {df.f.max()}, {len(datos["asesoras"])} asesoras '
          f'({repetidas} repetidas quitadas, {excluidas} de personas excluidas) -> {out}')
    if con_crm:
        cruzar_crm(datos, df)
    return datos, df


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args and not os.path.exists(HISTORIAL):
        sys.exit('Uso: python actualizar_datos.py exportacion1.xlsx [exportacion2.xlsx ...] [--sin-crm]\n'
                 'Sin archivos, vuelve a generar datos.js y crm.js con el historial (sirve para refrescar el CRM).')
    main(args, os.path.join(CARPETA, 'datos.js'), con_crm='--sin-crm' not in sys.argv)
