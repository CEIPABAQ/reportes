"""
Actualiza datos.js con una o varias exportaciones de Aircall.

Uso:
    pip install pandas openpyxl
    python actualizar_datos.py exportacion_grande.xlsx dia_24.xlsx dia_25.xlsx ...

Une todos los archivos, quita las llamadas repetidas (mismo "call id") y genera
datos.js en la misma carpeta. Luego sube ese archivo a GitHub.
Para el informe del núcleo, pasa siempre todos los Excel del núcleo: el grande y los diarios.

Reglas: conectada = answered Yes; efectiva = conectada con cualquier etiqueta que diga
"Contactado" (incluye "no puede hablar" y "familiar"), sin importar la duración.
Posgrados: Lina Beleno y Ana Isabel Zambrano Avendano; el resto, Pregrados.
No se incluye a quien esté en EXCLUIR (por ejemplo, coordinadoras).
"""
import json, sys, os
import pandas as pd

POSGRADOS = {'Lina Beleno', 'Ana Isabel Zambrano Avendano'}
EXCLUIR = {'Bleidys Torres', 'Karina Hernandez'}  # no entran en los reportes


def leer(paths):
    partes = [pd.read_excel(p) for p in paths]
    df = pd.concat(partes, ignore_index=True)
    antes = len(df)
    df = df.drop_duplicates(subset='call id (internal)', keep='last')
    repetidas = antes - len(df)
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


def main(paths, out):
    df, repetidas, excluidas = leer(paths)
    datos, df = construir(df)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write('/* Datos del panel: llamadas de Aircall agrupadas. Sin números de clientes. */\nwindow.DATOS = ')
        fh.write(json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
        fh.write(';\n')
    print(f'Listo: {len(df)} llamadas, del {df.f.min()} al {df.f.max()}, {len(datos["asesoras"])} asesoras '
          f'({repetidas} repetidas quitadas, {excluidas} de personas excluidas) -> {out}')
    return datos, df


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('Uso: python actualizar_datos.py exportacion1.xlsx [exportacion2.xlsx ...]')
    main(sys.argv[1:], os.path.join(os.path.dirname(os.path.abspath(__file__)), 'datos.js'))
