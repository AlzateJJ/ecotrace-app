# EcoTrace

Primera versión funcional de la plataforma de trazabilidad de PET, basada en los prototipos de Reciclador, Operario, Transportador, Empresa, Capacitador y Compartido, y en los dos PDF de la entrega académica.

Un repositorio Git y dos servicios desplegables de forma independiente:

```text
ecotrace-app/
├── front/              React + TypeScript + Vite, PWA y servidor web/proxy
│   ├── src/            Vistas, formularios, estilos y sincronización local
│   ├── public/         Iconos instalables
│   ├── test/           Pruebas de cola sin conexión
│   ├── Dockerfile
│   └── .env.example
├── back/               API Fastify + TypeScript + PostgreSQL
│   ├── src/            Autenticación, permisos y reglas de negocio
│   ├── migrations/     Esquema SQL versionado
│   ├── test/           Pruebas de integración con PostgreSQL embebido
│   ├── Dockerfile
│   └── .env.example
├── package.json        Comandos comunes y workspaces npm
└── package-lock.json   Dependencias de ambos servicios
```

## Ejecutar en desarrollo

Requisito: **Node.js 24 LTS** recomendado; mínimo 22.12. Instalar dependencias desde la raíz, no por separado en cada carpeta.

```powershell
npm ci
Copy-Item back/.env.example back/.env
npm run dev
```

Abrir <http://localhost:5173>. API en <http://127.0.0.1:3001/api/health>. El inicio aplica las migraciones y carga datos de ejemplo. El acceso permite registrarse o iniciar sesión con correo y contraseña. La pestaña de demostración permite explorar los perfiles de ejemplo, incluido el operario de planta y la administración.

Sin `DATABASE_URL`, el desarrollo usa **PGlite**, una versión embebida de PostgreSQL, y persiste en `back/.data/ecotrace`. Esto permite probar la app sin Docker ni una base remota. Producción exige una conexión PostgreSQL real y prohíbe el modo demo.

Para usar tu PostgreSQL en desarrollo, configurar `DATABASE_URL` en `back/.env`. Usar una base exclusiva de desarrollo si `DEMO_MODE=true`; el seed agrega registros de ejemplo. `DEV_EMBEDDED_DB=false` impide el uso del motor embebido.

## Compilar y probar la PWA

```powershell
npm run typecheck
npm test
npm run build
```

En dos terminales, desde la raíz:

```powershell
npm run start -w back
```

```powershell
npm run start -w front
```

Abrir <http://localhost:3000>. `front/serve.mjs` sirve la compilación y reenvía `/api` al backend. `front/.env` es opcional; su ejemplo permite cambiar `BACKEND_URL` y `PORT`. El proxy de Vite en desarrollo apunta a `127.0.0.1:3001` en `front/vite.config.ts`.

La PWA y el service worker se generan en la **compilación de producción**, no en `npm run dev`. Tiene manifest, iconos, fuentes locales, caché del cliente y aviso de actualización. La instalación en celulares requiere publicar con HTTPS. Android y navegadores compatibles ofrecen instalar; en iPhone se usa Compartir → Agregar a pantalla de inicio.

No se necesita un APK para estas funciones. Capacitor se puede incorporar después si se decide distribuir en tiendas o agregar capacidades nativas. Esta versión no incluye un proyecto Android ni un APK.

## Funciones y permisos

Los roles provienen de la sesión del servidor. Ocultar un botón en React no concede ni revoca permisos en la API.

| Rol                | Alcance y funciones                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reciclador         | Sus entregas, registro de material y peso estimado, QR, trazabilidad, liquidaciones y EcoPuntos propios.                                                       |
| Operario en acopio | Lotes de su sede, pesaje, aceptación/rechazo, novedades e inventario; prepara despachos hacia una planta y los asigna a un transportador.                      |
| Transportador      | Solo sus despachos y lotes asignados; valida cada código antes de cargar, inicia el viaje y registra la llegada.                                               |
| Operario en planta | Verifica el peso de los lotes enviados a su planta y confirma la recepción que genera los certificados.                                                        |
| Empresa            | Datos de su organización, indicadores, meta de recuperación, trazabilidad, CSV y certificados PDF; registra comprobantes de pagos realizados externamente.     |
| Capacitador        | Actividad de usuarios operativos de su organización, contacto, programación de talleres y asistencia a sus talleres. Sin acceso a pagos ni lotes individuales. |
| Administración     | Administra sedes de su organización, deshabilita accesos y consulta los datos de operación.                                                               |

El operario de planta usa el mismo rol `operario`, asociado a una sede de tipo `plant`. Esto cubre la confirmación del receptor sin permitir que el transportador certifique su propia entrega. El rol administrativo es un complemento operativo para mantener sedes y deshabilitar cuentas; no interviene en el registro público.

Flujo persistido:

```text
Entrega declarada → Pesaje en acopio → Despacho preparado
                  ↘ Rechazo           ↓ Carga validada por transportador
                                  En tránsito → Llegada a planta
                                                   ↓ Pesaje del receptor
                                       Entregado + certificado verificable
```

El pesaje aceptado en acopio genera una sola liquidación y un solo movimiento de puntos. Las diferencias de peso requieren explicación. En planta se conservan los pesos de origen y destino; una diferencia genera una novedad y no modifica silenciosamente el valor liquidado en acopio.

Los certificados tienen un código público de verificación limitado al material, peso, origen y destino, sin mostrar datos de pagos ni información privada del usuario. Son constancias de registros en EcoTrace, no certificaciones ambientales otorgadas por terceros.

## Registro público sin correos

Cada persona crea su cuenta con nombre, correo, contraseña y uno de cinco roles: reciclador, operario, transportador, empresa o capacitador. Entra inmediatamente; no requiere invitación, aprobación ni código de correo. El correo debe tener formato válido y ser único, pero **no se comprueba la existencia del buzón ni su propiedad**. No se envían mensajes y no se necesita Resend ni SMTP.

La contraseña admite entre 15 y 128 caracteres, se guarda con scrypt y sal aleatoria y nunca se devuelve al cliente. Hay límites de solicitudes en registro e ingreso, protección de origen y sesiones revocables de 24 horas en cookies HttpOnly. No existe recuperación de contraseña por correo en este PMV.

Todas las cuentas públicas ingresan a la organización indicada por `PUBLIC_REGISTRATION_ORG_ID` en el backend. La API no acepta que el cliente cambie esa organización, sus permisos o el estado de la cuenta. Elegir `empresa` da acceso a los datos y pagos de esa organización, conforme al modelo de roles autoseleccionados del PMV. No es un mecanismo para verificar la relación de una persona con una empresa; si se incorporan organizaciones independientes, será necesario definir su afiliación antes de abrir el registro a ellas.

El operario selecciona un acopio o planta de esa misma organización. Las sedes físicas deben estar creadas antes de registrar operarios o recibir entregas. La administración mantiene ese catálogo; no crea las cuentas de los demás. El rol `admin` no aparece en el formulario y la API rechaza su registro público.

La migración `002` conserva usuarios y operaciones anteriores, invalida las sesiones anteriores y elimina los códigos de acceso. Las cuentas previas sin contraseña no pueden reclamarse mediante registro: necesitan una asignación segura de contraseña por el responsable del despliegue. No se les asigna una contraseña compartida ni se sobrescriben sus datos. Los perfiles demo siguen disponibles exclusivamente en desarrollo.

## Trabajo sin conexión

Después de ingresar y cargar información con conexión, se conserva una copia local por usuario. El reciclador puede preparar entregas sin red y enviarlas al reconectar; cada borrador tiene un identificador estable para evitar duplicados. El QR aparece cuando el servidor confirma la entrega. Los borradores pendientes sobreviven a una falla y solo se sincronizan para su usuario.

Pesajes, pagos, despachos y asistencia requieren conexión. La primera autenticación también requiere red. El cierre de sesión requiere conexión para revocar la sesión del servidor; no se simula un cierre dejando la cookie activa. Los datos locales permanecen en el dispositivo para el uso sin conexión: para equipos compartidos debe acordarse una política de dispositivos antes de un piloto real.

## Desplegar en Railway Hobby

PMV publicado en **[EcoTrace](https://front-production-0cd6a330.up.railway.app)**. [Proyecto Railway](https://railway.com/project/afa529f5-0a75-4ae0-9651-605677ca963d), entorno `production`, con servicios `front`, `back` y `Postgres`. Solo el front tiene dominio público; la API y PostgreSQL se conectan por la red privada. No hay administrador ni proveedor de correo configurados: los usuarios usan **Crear cuenta** y eligen su rol.

Para replicar el despliegue, crear en un proyecto esos tres servicios. Los dos servicios de aplicación usan este mismo repositorio y **Root Directory en la raíz**, porque comparten workspaces y lockfile. Elegir Dockerfile y su ruta en Settings → Build (o la variable `RAILWAY_DOCKERFILE_PATH`); no usar `/front` o `/back` como directorio raíz ni configurar comandos adicionales de compilación o inicio.

| Variable | `front` | `back` |
| --- | --- | --- |
| `RAILWAY_DOCKERFILE_PATH` | `front/Dockerfile` | `back/Dockerfile` |
| `PORT` | `3000` | `3001` |
| `NODE_ENV` | `production` | `production` |
| `BACKEND_URL` | `http://${{back.RAILWAY_PRIVATE_DOMAIN}}:3001` | — |
| `APP_ORIGIN` | — | URL pública HTTPS del front, sin barra final |
| `DATABASE_URL` | — | `${{Postgres.DATABASE_URL}}` (ajustar nombre del servicio) |
| `PUBLIC_REGISTRATION_ORG_ID` | — | `org-ecotrace`, o ID de la organización existente |
| `BOOTSTRAP_ORG_NAME` | — | Nombre de la organización |
| `MVP_SEED_SITES` | — | `true` para este PMV con sedes ficticias de Medellín |
| `DEMO_MODE` | — | `false` |
| `DEV_EMBEDDED_DB` | — | `false` |

1. Crear PostgreSQL con almacenamiento persistente y los dos servicios del repositorio. Usar una réplica por servicio para este PMV; los límites de solicitudes se mantienen en memoria por instancia.
2. Generar el dominio público del front en el puerto 3000 y copiar ese origen a `APP_ORIGIN` del back. El back y PostgreSQL permanecen privados. Front reenvía `/api` al back y mantiene las cookies en el mismo origen.
3. Configurar las variables anteriores usando los nombres definitivos de los servicios. Si se renombra un servicio, revisar las referencias: una referencia al nombre anterior puede resolverse vacía. La organización se crea automáticamente al primer inicio. No cambiar su ID una vez que tenga datos. Configurar `DATABASE_SSL=true` solo si la conexión elegida exige TLS; se conserva la verificación de certificados.
4. Para administrar sedes, configurar opcionalmente `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 15 caracteres) y `BOOTSTRAP_ADMIN_NAME` **como secretos en Railway** antes del primer despliegue. No hay un correo predefinido. Una cuenta pública existente nunca se convierte automáticamente en administradora. Estas variables no actualizan ni recuperan contraseñas existentes.
5. Desplegar back y front. Las migraciones se aplican al inicio dentro de una transacción con bloqueo, sin requerir la base durante el build. Configurar healthcheck del back en `/api/health` y del front en `/`; usar 120 segundos de margen para el primer inicio.
6. Si se configuró una cuenta administrativa, entrar, crear los centros y plantas reales y retirar de Railway las dos variables de credenciales de bootstrap. Para el PMV publicado, `MVP_SEED_SITES=true` habilita el registro con las tres sedes ficticias sin necesitar ese paso. Los usuarios usan **Crear cuenta**, eligen su rol y acceden directamente.
7. Comprobar registro, cierre e inicio de sesión, los flujos de cada rol y la instalación PWA desde el dominio HTTPS. La base debe conservar los registros después de un redespliegue.

Con `MVP_SEED_SITES=true`, una organización sin sedes recibe dos acopios de demostración (Centro y Belén) y una planta de demostración (Guayabal), todos ubicados de forma ficticia en Medellín. Quedan identificados como Demo; no son establecimientos reales. El seed no crea usuarios, lotes o pagos, no habilita accesos demo y no modifica catálogos existentes. Permite registrar también operarios desde el primer inicio, sin administrador. Para mantener después el catálogo se puede usar la cuenta administrativa opcional.

Hobby admite esta arquitectura. Configurar alertas/límite de gasto: la suscripción incluye consumo, pero el costo total depende de los recursos utilizados por los tres servicios. No se requiere contratar correo para este PMV. No se agregan archivos `railway.toml`/`railway.json`: la configuración se realiza en Railway con los Dockerfiles existentes.

Fuentes: [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [monorepos](https://docs.railway.com/deployments/monorepo), [red privada](https://docs.railway.com/networking/private-networking) y [plan Hobby](https://docs.railway.com/pricing/plans).

## Validación y alcance de esta versión

Las pruebas de integración ejecutan las migraciones y reglas de negocio sobre PGlite, con solicitudes HTTP inyectadas en Fastify. Cubren autenticación y CSRF, separación entre organizaciones y propietarios, permisos por rol/sede, rechazo, pesaje, liquidación idempotente, cadena completa de custodia, emisión de PDF, asistencia, registro público por rol, contraseñas, duplicados, acceso inmediato, cierre de sesión, límites de ingreso, cuentas deshabilitadas y migración de cuentas existentes. Las pruebas del front cubren persistencia de borradores, separación por usuario y reintentos. La conexión real con Railway se comprobó desde el dominio público; la instalación y cámara en dispositivos físicos siguen pendientes.

### Validación del 26 de noviembre de 2026

- `npm run typecheck`, `npm run build` y las **17 pruebas** (15 backend + 2 front) pasan. La compilación genera manifest y service worker.
- Las pruebas de API registran los cinco roles públicos, incluido operario de acopio y planta, y recorren entrega → pesaje → despacho → transporte → recepción → certificado → pago con esas cuentas nuevas. También verifican talleres, rechazos de escalamiento de permisos, duplicados, límites de ingreso y migraciones.
- En navegador se comprobaron registro de reciclador y operario, selección de sede, rechazo de contraseñas distintas, ingreso posterior, cierre de sesión y persistencia al recargar. Formulario móvil de 390 × 844 sin desbordamiento horizontal; sin errores de consola observados.
- Ambas imágenes Docker se construyeron y ejecutaron con `NODE_ENV=production`, un PostgreSQL 18 temporal y la API detrás del proxy del front. Se comprobó alta/ingreso/cierre de los cinco roles, cookies seguras, recursos PWA y conservación de cuentas al reiniciar. No se configuró proveedor de correo ni administrador para estas altas. Las sedes de prueba se cargaron como fixtures.
- Los servidores y contenedores locales de prueba se detuvieron al terminar. Los tres servicios publicados en Railway permanecen activos.
- Desde el dominio público de Railway se registraron y autenticaron los cinco roles (con un operario de acopio y otro de planta), se comprobaron cookies seguras, cierre de sesión, bloqueo del registro administrativo y ausencia de accesos demo. Se recorrió la cadena completa con 20 kg de prueba, se descargó el PDF, se verificó el certificado sin sesión y se registraron un comprobante externo y asistencia a un taller. Los límites por rol/sede rechazaron acciones no autorizadas.
- Referencias de los datos ficticios conservados en Railway: lote `LT-2026-92BF4707`, despacho `DSP-2026-DF722DFB`, certificado `CO-2026-B313BF31`. Las cuentas y el taller se identifican como **Prueba PMV**; no representan operaciones ni pagos reales. Manifest y service worker responden correctamente por HTTPS. También se comprobó en el navegador el registro público de un operario y su acceso inmediato a Acopio Centro · Demo.

### Validación manual histórica del 21 de noviembre de 2026

Este recorrido corresponde a la versión anterior con códigos de acceso; ese mecanismo fue reemplazado por registro e ingreso con contraseña.

Se ejecutó `npm run dev` con Vite en `http://localhost:5173` y la API con recarga automática en `http://127.0.0.1:3001`. Base local PGlite y datos de demostración; no representan operaciones reales. Se completaron estos recorridos en el navegador:

| Perfil | Recorrido verificado | Resultado |
| --- | --- | --- |
| Reciclador | Registrar 25,5 kg de PET transparente, elegir acopio, obtener QR, consultar recorrido y pago; editar perfil y abrir notificaciones | Entrega guardada; valor estimado y liquidación de $30.600; pago visible después de registrarlo desde Empresa; perfil persistido al recargar. |
| Operario de acopio | Consultar código, aceptar pesaje, seleccionar lote y crear despacho hacia Planta Medellín asignado a Santiago Ríos | Recepción y despacho guardados; lote disponible para el transportador asignado. |
| Transportador | Validar el código del lote, confirmar carga, iniciar viaje, registrar llegada y consultar despachos completados | Estados correctos; cierre confirmado por planta visible también en pantalla móvil de 390 × 844, sin desbordamiento horizontal. Se ingresó el código manualmente, sin usar cámara física. |
| Operario de planta | Abrir despacho pendiente, confirmar 25,5 kg y emitir certificado | Despacho entregado y certificado emitido tras la confirmación del receptor. |
| Empresa | Consultar certificado, descargar PDF y CSV, verificar enlace público sin sesión, registrar comprobante y cambiar meta | Archivos descargados y contenido comprobado; PDF de una página revisado visualmente; meta persistida al recargar. |
| Capacitador | Filtrar acompañamiento, consultar persona y enlace de contacto, crear taller, guardar asistencia y recargar | Grupo inscrito automáticamente; asistencia de 1 de 2 personas persistida. Fecha pasada rechazada. No se enviaron mensajes externos. |
| Administración | Crear sede, crear operario asociado, iniciar sesión con código de desarrollo, deshabilitar usuario y recargar | El nuevo operario vio solo su sede vacía; deshabilitación persistida; el usuario deshabilitado no obtuvo código de acceso. |

Datos para localizar el recorrido en la demo: lote `LT-2026-1E191AE1`, despacho `DSP-2026-6F859AE2`, certificado `CO-2026-0C97E08D` y comprobante `QA-20261121-HP-30600`. Se conservaron los registros de prueba. La revisión terminó sin fallos funcionales en estos recorridos ni errores de consola observados; `npm test` volvió a pasar sus **9 pruebas** (7 de API y 2 de sincronización local).

Esta comprobación histórica cubre los flujos principales implementados, no todas las combinaciones posibles. Las pruebas posteriores con Railway/PostgreSQL remoto se describen arriba. Siguen pendientes cámara, instalación en un celular físico y navegación realmente sin red; la cola sin conexión está cubierta por pruebas automatizadas.

Esta entrega implementa el flujo central de los prototipos. Quedan para iteraciones posteriores: integración bancaria, SMS/WhatsApp automático, notificaciones push, mapas/GPS continuo, fotografías y almacenamiento de evidencias, básculas conectadas, canje de EcoPuntos, recuperación de borradores con errores de validación y gestión avanzada de tarifas. Los pagos actuales solo registran comprobantes externos; el botón WhatsApp abre una conversación sin enviarla. No se admiten recepciones parciales de despachos ni devoluciones posteriores al cierre en esta versión.

Antes de producción con volumen real también corresponde agregar paginación, política de retención y copias de seguridad, observabilidad, recuperación operativa y pruebas de carga. Los endpoints de resumen consultan los registros de la organización completa, adecuados para esta primera versión académica.
