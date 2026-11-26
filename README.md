# Hans & Valeria

Invitación de boda para el 26 de diciembre de 2026. La web usa Next.js en Vercel y guarda las confirmaciones en una hoja privada de Google Sheets mediante una aplicación web de Google Apps Script.

## Configurar Google Sheets

La hoja de confirmaciones es [Hans & Valeria — Confirmaciones](https://docs.google.com/spreadsheets/d/TU_SPREADSHEET_ID/edit). Mantén su acceso restringido a los propietarios y colaboradores que deban consultar las respuestas. No es necesario hacerla pública.

La pestaña se llama `Confirmaciones`. Su primera fila debe contener, en este orden:

| A | B | C | D | E |
|---|---|---|---|---|
| ID | Nombre | Asistencia | Mensaje | Fecha UTC |

Cada envío ocupa una fila. La asistencia se guarda como `yes` o `no`; la fecha se registra en UTC. No hay una columna de acompañantes ni se solicita una cantidad de personas.

No cambies los encabezados, el orden de las columnas, los identificadores, los valores `yes`/`no` ni el formato de las fechas. No agregues títulos, notas ni filas de totales dentro del conjunto de datos. Para revisar las respuestas, usa el panel o la hoja privada.

## Configurar Google Apps Script

Mantén las cinco columnas como un rango normal de celdas, sin convertirlas en una Tabla de Google Sheets. Las columnas con tipos automáticos de una Tabla pueden impedir que Apps Script aplique el formato de texto al guardar una respuesta.

1. Abre el editor de Apps Script del proyecto que conectará la hoja y copia el contenido de `google-apps-script/Code.gs`.
2. En **Configuración del proyecto → Propiedades del script**, configura estas propiedades:

   | Propiedad | Valor que debes configurar |
   |---|---|
   | `API_SECRET` | Secreto aleatorio de al menos 32 caracteres. Debe coincidir exactamente con `GOOGLE_SHEETS_SECRET` en Vercel. |
   | `SPREADSHEET_ID` | Identificador de la hoja, tomado del segmento entre `/d/` y `/edit` de su enlace. |
   | `SHEET_NAME` | Opcional. Si se omite, se utiliza `Confirmaciones`. |

3. Elige **Implementar → Nueva implementación → Aplicación web**.
4. Configura la ejecución como **propietario** y el acceso como **Cualquiera / Anyone**. Autoriza el acceso a la hoja con la cuenta que la administra.
5. Copia la URL publicada que termina en `/exec`. La URL `/dev` sirve para pruebas de editores y no debe usarse en Vercel.

El endpoint puede recibir solicitudes de Internet, pero el script exige una firma HMAC y valida su antigüedad antes de leer o escribir en la hoja. El secreto se usa entre el servidor de Vercel y Apps Script; no se entrega al navegador. La hoja permanece privada.

Cuando cambies el código de Apps Script, actualiza su implementación con una versión nueva. Si se genera otra URL `/exec`, actualízala también en Vercel.

## Configurar Vercel

Usa el preset **Next.js** y Node.js **24.x**, como indica `package.json`. Vercel debe instalar con `npm ci` y compilar con `npm run build`.

En **Project Settings → Environment Variables**, configura:

| Variable | Uso |
|---|---|
| `GOOGLE_SHEETS_WEB_APP_URL` | URL publicada de Apps Script que termina en `/exec`. |
| `GOOGLE_SHEETS_SECRET` | El mismo valor privado que `API_SECRET`. |
| `ADMIN_PASSWORD` | Contraseña independiente de al menos 24 caracteres para el panel privado. |

Estas tres variables se utilizan únicamente en el servidor. No las renombres con el prefijo `NEXT_PUBLIC_`, no las añadas al código cliente y no las publiques en este repositorio.

Configura los valores en el entorno que vayas a desplegar, como Production. Si también habilitas Preview, configura sus variables correspondientes. Después de cambiar variables, realiza un nuevo despliegue para que se apliquen.

La invitación publicada y verificada está en **https://hans-valeria.vercel.app**. Comparte ese enlace con los invitados. El panel privado está en **https://hans-valeria.vercel.app/invitados**.

Al publicar una nueva versión por CLI, comprueba que ese enlace apunte al nuevo despliegue. Si necesitas actualizar el alias gratuito, utiliza `vercel alias set <URL_DEL_NUEVO_DESPLIEGUE> hans-valeria.vercel.app` desde el proyecto y la cuenta correctos.

## Desarrollo local

Requisitos: Node.js 24.x y npm.

1. Instala las dependencias desde el archivo de bloqueo:

   ```sh
   npm ci
   ```

2. Copia `.env.example` a `.env.local` y completa los tres valores de servidor. `.env.local` está excluido de Git y del envío a Vercel.
3. Comprueba la compilación:

   ```sh
   npm run build
   ```

4. Para trabajar localmente usa `npm run dev`. Para ejecutar una compilación ya generada usa `npm start`. Abre **http://localhost:3000**; es la dirección canónica usada en las pruebas locales de Next.js.

## Consultar confirmaciones

- Abre la hoja privada con la cuenta de Google autorizada, o visita `/invitados` dentro del sitio de la boda.
- El panel `/invitados` solicita la contraseña configurada en `ADMIN_PASSWORD`. Allí puedes consultar las respuestas y descargar el CSV.
- La contraseña del panel es personal. Compártela únicamente con quienes deban administrar las confirmaciones.

## Qué ve cada invitado

El formulario pide su nombre, si asistirá y un mensaje opcional. Solo muestra **¡Confirmado!** después de que el servidor haya guardado una respuesta afirmativa. Si la persona no asistirá, muestra **Respuesta registrada**. Un error permite reintentar el envío.

Después de guardar aparece **Enviar también por WhatsApp**. Este botón abre un mensaje preparado; el invitado debe pulsar **Enviar** en WhatsApp. No se envían mensajes automáticamente.

## Archivos de configuración

`.env.example` documenta los nombres de las variables y no contiene secretos. `.gitignore` mantiene los archivos locales fuera de Git. `.vercelignore` excluye dependencias instaladas, compilaciones locales, archivos de entorno, pruebas, código de Apps Script y material privado del envío a Vercel; la plataforma compila desde el código fuente.
