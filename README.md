# Panel de llamadas Aircall

Panel web con las llamadas de admisiones en Aircall: salientes, no conectadas, entrantes, por hora y rellamadas. Tiene filtros por día o rango, semanas, núcleos, equipos y asesoras (se pueden marcar varias opciones), y las tablas se ordenan con un clic en cada columna.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página. |
| `styles.css` | Colores, tipografía y diseño (paleta crema clara). |
| `app.js` | Cálculos, filtros, tablas y gráficos. |
| `datos.js` | Los datos de las llamadas, agrupados y sin números de clientes. |
| `crm.js` | El cruce de las llamadas con el CRM y la ficha de cada lead, sin teléfonos, nombres, cédulas, correos ni observaciones. |
| `crm_panel.js` | Cálculos, tablas y gráficos de la pestaña CRM. |
| `actualizar_datos.py` | Genera `datos.js` y `crm.js` a partir de las exportaciones de Aircall. |
| `crm_sync.py` | Cruza las llamadas con el CRM; lo usa `actualizar_datos.py`. |

## Publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `panel-llamadas-aircall`.
2. Sube los archivos `.html`, `.css` y `.js` a la raíz del repositorio (botón **Add file → Upload files**).
3. Ve a **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
5. En uno o dos minutos GitHub muestra la dirección, algo como `https://TU-USUARIO.github.io/panel-llamadas-aircall/`. Esa es la que compartes.

Importante: con GitHub Pages gratuito, la página es pública para cualquiera que tenga el enlace, aunque el repositorio sea privado (los repositorios privados con Pages requieren un plan de pago). El panel no tiene números de clientes, pero sí nombres de asesoras y cifras de gestión.

## Actualizar los datos

1. Descarga desde Aircall el historial de llamadas del día en Excel y déjalo en la carpeta del proyecto.
2. En tu computador, con Python instalado, pasa solo el Excel nuevo. El script lo suma al historial acumulado (`historial_llamadas.csv.gz`) y quita las llamadas repetidas, así que cargar dos veces el mismo archivo no duplica nada:

   ```
   pip install pandas openpyxl
   python actualizar_datos.py dia_26.xlsx
   ```

3. Se generan `datos.js` y `crm.js` nuevos con todo el historial. Súbelos a GitHub reemplazando los anteriores. La página se actualiza sola en un par de minutos.

El cruce con el CRM usa la skill `crm-ceipa` de este computador, con tu código de acceso. Cada día solo consulta los negocios de HubSpot que cambiaron desde la última vez, así que siempre muestra el estado más reciente de cada negocio, también para llamadas de días pasados. Si el CRM no responde (por ejemplo, porque la red cambió de IP), `datos.js` se actualiza igual y `crm.js` queda como estaba. Para refrescar solo el CRM, sin Excel nuevo, corre `python actualizar_datos.py`; para saltarte el CRM, agrega `--sin-crm`.

El historial queda solo en tu computador: guarda las columnas que usa el panel y los números de clientes cifrados, y está en `.gitignore` junto con los Excel, que no se suben a GitHub. Haz copia de `historial_llamadas.csv.gz`; si se pierde, vuelve a pasar todos los Excel juntos y se reconstruye.

El cruce con el CRM también deja archivos locales que no se suben: `crm_indice.csv.gz` y `crm_detalle.csv.gz` (copia de trabajo del CRM, con teléfonos cifrados), `crm_estado.json`, `crm_no_encontrados.csv` (los números reales que no aparecen en el CRM), `crm_leads_sin_llamar.csv` (leads abiertos que nadie ha llamado, con el id del negocio para buscarlos en HubSpot) `crm_leads_saturados.csv` (leads con 6 llamadas o más y ninguna conectada) y `crm_privado.js` (nombre, cédula, celular, correo y observaciones de cada lead: con él, la ficha del panel muestra esos datos cuando se abre en este computador; nunca se sube a GitHub y la página publicada no lo carga). Si se borran, la siguiente actualización los vuelve a traer completos (tarda unos tres minutos).

Si entra una asesora nueva a Posgrados, agrégala en la línea `POSGRADOS` de `actualizar_datos.py` y también en el texto "Equipos" al final de `index.html`.

## Reglas de clasificación

- **Conectada:** Aircall la marca como contestada (`answered = Yes`). Incluye buzón y mensajes de la operadora.
- **Efectiva:** conectada y con cualquier etiqueta que diga "Contactado" (incluye "no puede hablar" y "Mensaje con familiar/conocido"), sin importar la duración.
- **% conectadas** = conectadas / llamadas. **Efectivas totales** = efectivas / llamadas (siempre sobre todas las llamadas, no sobre las conectadas).
- **Semanas:** de lunes a domingo; la semana 1 empieza el 12 de octubre de 2026. **Núcleos:** periodos de dos meses desde el 12 de octubre.
- **Equipos:** Posgrados son Lina Beleno y Ana Isabel Zambrano Avendano; el resto, Pregrados. Bleidys Torres y Karina Hernandez no se incluyen: están en la lista `EXCLUIR` de `actualizar_datos.py`.

## Pestañas CRM pregrado y CRM posgrado

- **Cruce:** el número de cada llamada saliente se busca en el celular de los negocios de HubSpot, normalizado a solo dígitos con indicativo, así que coinciden `+57 300 123 4567`, `3001234567`, `573001234567` y otras variantes. Si un número tiene varios negocios, se toma uno de pipeline activo y, entre ellos, el más reciente.
- **Pipelines:** CRM pregrado muestra Pregrado Barranquilla y CRM posgrado, Especializaciones (lista `CRM_TABS` en `crm_panel.js`). Los números que no están en el CRM se cuentan con el equipo de la pestaña (Pregrados o Posgrados); las llamadas a leads de otros pipelines se cuentan aparte en una nota.
- **Filtros propios:** tipo de lead (Flow / Stock, propiedad *Tipo de lead* de HubSpot) y canal. Con cualquiera de los dos activo solo cuentan números que están en el CRM.
- **Lista de leads:** cada cifra de las tablas abre una ventana con los leads que la forman, con buscador, filtros por tipo y etapa, y descarga en CSV. Cada lead se despliega con su ficha: de dónde viene, quién lo tiene, cómo va (etapa e hitos), todas sus llamadas en Aircall y, solo en el computador con `crm_privado.js`, nombre, cédula, celular, correo y observaciones. Si se llena `HUBSPOT_PORTAL` en `crm_sync.py`, la ficha trae el enlace directo al negocio.
- **Actividad de ingreso:** la propiedad *Origen del lead (n)* (Stand, Charla presencial, Ferias, Webinars…); si está vacía y el lead tiene un curso o webinar en *Evento (n)*, cuenta como "Evento".
- **Estado actual:** pipeline, etapa, canal, activador y propietaria son los de hoy en HubSpot, no los del día de la llamada.
- **A sus leads:** la asesora que llamó en Aircall es la propietaria del negocio en HubSpot. Los nombres se comparan sin tildes y aceptando palabras de más; las excepciones van en `ALIAS` de `crm_sync.py`.
- **Velocidad al primer contacto:** solo leads creados desde el 13 de octubre, sin llamadas antes de existir en HubSpot y sin las cargas masivas (más de 300 leads llamados creados el mismo día, como el cambio de periodo del 16 de octubre).
- **Resultado de las llamadas:** de los leads llamados en el periodo, cuántos tienen hoy en HubSpot fecha de contactado, de cita, de inscripción o de matrícula (NE). Se puede ver por asesora, canal, activador, programa académico o campaña UTM (solo canal Internet).
- **Leads que nadie ha llamado:** todos los leads de los dos pipelines creados desde el 13 de octubre, filtrados por fecha de creación; "pendiente" es un lead en etapa abierta (no Anulado, Desertado, Matriculado, Facturado, Inscrito, Otro Periodo ni Devolución) sin ninguna llamada en Aircall. Los filtros de equipo y asesora se aplican a la propietaria.
- **Leads intentados demasiado:** leads con 4, 6, 8 o 10 llamadas o más en el periodo y ninguna conectada, por propietaria y etapa.
- **Caché:** `index.html` carga los archivos con `?v=N`; si cambias `app.js`, `crm_panel.js` o `styles.css`, sube ese número para que los navegadores no usen la versión vieja.

## Probarlo en tu computador

Abre `index.html` con doble clic. Necesita conexión a internet para cargar la librería de gráficos (d3) y las fuentes.
