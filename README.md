# Panel de llamadas Aircall

Panel web con las llamadas de admisiones en Aircall: salientes, no conectadas, entrantes, por hora y rellamadas. Tiene filtros por día o rango, semanas, núcleos, equipos y asesoras (se pueden marcar varias opciones), y las tablas se ordenan con un clic en cada columna.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página. |
| `styles.css` | Colores, tipografía y diseño (paleta crema clara). |
| `app.js` | Cálculos, filtros, tablas y gráficos. |
| `datos.js` | Los datos de las llamadas, agrupados y sin números de clientes. |
| `actualizar_datos.py` | Genera un `datos.js` nuevo a partir de una exportación de Aircall. |

## Publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `panel-llamadas-aircall`.
2. Sube los cinco archivos a la raíz del repositorio (botón **Add file → Upload files**).
3. Ve a **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
5. En uno o dos minutos GitHub muestra la dirección, algo como `https://TU-USUARIO.github.io/panel-llamadas-aircall/`. Esa es la que compartes.

Importante: con GitHub Pages gratuito, la página es pública para cualquiera que tenga el enlace, aunque el repositorio sea privado (los repositorios privados con Pages requieren un plan de pago). El panel no tiene números de clientes, pero sí nombres de asesoras y cifras de gestión.

## Actualizar los datos

1. Descarga desde Aircall el historial de llamadas en Excel.
2. En tu computador, con Python instalado, pasa todos los Excel del núcleo (el grande y los diarios). El script los une y quita las llamadas repetidas:

   ```
   pip install pandas openpyxl
   python actualizar_datos.py exportacion_grande.xlsx dia_24.xlsx dia_25.xlsx
   ```

3. Se genera un `datos.js` nuevo en la carpeta. Súbelo a GitHub reemplazando el anterior. La página se actualiza sola en un par de minutos.

Si entra una asesora nueva a Posgrados, agrégala en la línea `POSGRADOS` de `actualizar_datos.py` y también en el texto "Equipos" al final de `index.html`.

## Reglas de clasificación

- **Conectada:** Aircall la marca como contestada (`answered = Yes`). Incluye buzón y mensajes de la operadora.
- **Efectiva:** conectada y con cualquier etiqueta que diga "Contactado" (incluye "no puede hablar" y "Mensaje con familiar/conocido"), sin importar la duración.
- **% conectadas** = conectadas / llamadas. **% efectivas** = efectivas / conectadas.
- **Semanas:** de lunes a domingo; la semana 1 empieza el 12 de octubre de 2026. **Núcleos:** periodos de dos meses desde el 12 de octubre.
- **Equipos:** Posgrados son Lina Beleno y Ana Isabel Zambrano Avendano; el resto, Pregrados. Bleidys Torres (coordinadora) no se incluye: está en la lista `EXCLUIR` de `actualizar_datos.py`.

## Probarlo en tu computador

Abre `index.html` con doble clic. Necesita conexión a internet para cargar la librería de gráficos (d3) y las fuentes.
