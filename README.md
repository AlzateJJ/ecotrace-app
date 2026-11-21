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

Abrir <http://localhost:5173>. API en <http://127.0.0.1:3001/api/health>. El inicio aplica las migraciones y carga datos de ejemplo. Desde el acceso se puede elegir cada perfil, incluido el operario de planta y la administración.

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
| Administración     | Crea usuarios y sedes de su organización, deshabilita accesos y consulta los datos de operación.                                                               |

El operario de planta usa el mismo rol `operario`, asociado a una sede de tipo `plant`. Esto cubre la confirmación del receptor sin permitir que el transportador certifique su propia entrega. El rol administrativo es un complemento operativo para habilitar cuentas y sedes.

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

## Trabajo sin conexión

Después de ingresar y cargar información con conexión, se conserva una copia local por usuario. El reciclador puede preparar entregas sin red y enviarlas al reconectar; cada borrador tiene un identificador estable para evitar duplicados. El QR aparece cuando el servidor confirma la entrega. Los borradores pendientes sobreviven a una falla y solo se sincronizan para su usuario.

Pesajes, pagos, despachos y asistencia requieren conexión. La primera autenticación también requiere red. El cierre de sesión requiere conexión para revocar la sesión del servidor; no se simula un cierre dejando la cookie activa. Los datos locales permanecen en el dispositivo para el uso sin conexión: para equipos compartidos debe acordarse una política de dispositivos antes de un piloto real.

## Desplegar en Railway

No se ha creado un proyecto remoto ni conectado una base de Railway desde esta entrega. Los Dockerfile están preparados para construir **desde la raíz del repositorio**, porque ambos servicios comparten el lockfile npm.

Crear en el mismo proyecto y ambiente de Railway tres servicios: `front`, `back` y PostgreSQL. Front y back usan el mismo repositorio. Mantener Root Directory en la raíz; seleccionar builder Dockerfile y el archivo `front/Dockerfile` o `back/Dockerfile` respectivamente (también se puede configurar `RAILWAY_DOCKERFILE_PATH`). No establecer Root Directory en `/front` o `/back` con estos Dockerfile.

| Variable                  | Servicio `front`                               | Servicio `back`                                                        |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `RAILWAY_DOCKERFILE_PATH` | `front/Dockerfile`                             | `back/Dockerfile`                                                      |
| `PORT`                    | `3000`                                         | `3001`                                                                 |
| `BACKEND_URL`             | `http://${{back.RAILWAY_PRIVATE_DOMAIN}}:3001` | —                                                                      |
| `NODE_ENV`                | `production`                                   | `production`                                                           |
| `APP_ORIGIN`              | —                                              | URL pública HTTPS del front, sin barra final                           |
| `DATABASE_URL`            | —                                              | `${{Postgres.DATABASE_URL}}` según el nombre de tu servicio PostgreSQL |
| `DEMO_MODE`               | —                                              | `false`                                                                |
| `DEV_EMBEDDED_DB`         | —                                              | `false`                                                                |

Publicar el dominio del **front** con puerto 3000. El back puede permanecer en la red privada; escucha IPv4/IPv6 en producción para admitir los dominios internos de Railway. El navegador accede a `/api` en el mismo origen del front, con cookies `HttpOnly`, `Secure` en producción y `SameSite=Strict`.

En el back configurar también:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` para enviar códigos de inicio de sesión por correo.
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` y `BOOTSTRAP_ORG_NAME` para el primer acceso. Solo se crea este administrador si la base no tiene usuarios.
- `DATABASE_SSL=true` únicamente si la conexión elegida exige TLS; la verificación de certificados permanece habilitada.

Las migraciones se ejecutan al arrancar el back, dentro de una transacción con bloqueo. No necesitan conexión a la base durante la construcción de la imagen. Después del primer inicio, entrar con el correo del administrador y su código; crear sedes y usuarios. `GET /api/health` es el endpoint de comprobación del back. Variables secretas se configuran en Railway, no en Git.

Fuentes de configuración: [Dockerfiles en Railway](https://docs.railway.com/builds/dockerfiles), [monorepos](https://docs.railway.com/deployments/monorepo) y [dominios privados](https://docs.railway.com/networking/domains/working-with-domains).

## Validación y alcance de esta versión

Las pruebas de integración ejecutan las migraciones y reglas de negocio sobre PGlite, con solicitudes HTTP inyectadas en Fastify. Cubren autenticación y CSRF, separación entre organizaciones y propietarios, permisos por rol/sede, rechazo, pesaje, liquidación idempotente, cadena completa de custodia, emisión de PDF, asistencia y códigos de acceso de un solo uso. Las pruebas del front cubren persistencia de borradores, separación por usuario y reintentos. La conexión real con Railway, el envío SMTP y la instalación/cámara en dispositivos físicos deben probarse con la infraestructura configurada.

Se probaron en el navegador el diseño de escritorio y móvil, el registro de una entrega y su recepción desde otro rol. Los datos de demostración no representan operaciones reales.

Esta entrega implementa el flujo central de los prototipos. Quedan para iteraciones posteriores: integración bancaria, SMS/WhatsApp automático, notificaciones push, mapas/GPS continuo, fotografías y almacenamiento de evidencias, básculas conectadas, canje de EcoPuntos, recuperación de borradores con errores de validación y gestión avanzada de tarifas. Los pagos actuales solo registran comprobantes externos; el botón WhatsApp abre una conversación sin enviarla. No se admiten recepciones parciales de despachos ni devoluciones posteriores al cierre en esta versión.

Antes de producción con volumen real también corresponde agregar paginación, política de retención y copias de seguridad, observabilidad, recuperación operativa y pruebas de carga. Los endpoints de resumen consultan los registros de la organización completa, adecuados para esta primera versión académica.
