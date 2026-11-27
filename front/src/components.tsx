import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Leaf,
  X,
  Package,
  ScanLine,
  CameraOff,
  Check,
  LoaderCircle,
  Download,
  Smartphone,
} from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { createPwaInstall } from "./pwa-install";

// Capture the browser event before the login screen or sidebar mounts.
const installation = createPwaInstall(
  window,
  window.matchMedia("(display-mode: standalone)"),
  (navigator as Navigator & { standalone?: boolean }).standalone,
);
if (import.meta.hot) import.meta.hot.dispose(() => installation.dispose());

export const money = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(n));
export const number = (n: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(
    Number(n),
  );
export const date = (v: string, full = false) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    ...(full ? { year: "numeric" as const } : {}),
    timeZone: "America/Bogota",
  }).format(new Date(v));
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={"brand " + (light ? "light" : "")}>
      <span className="brand-mark">
        <Leaf size={25} />
      </span>
      <span>
        Eco<span className="brand-trace">Trace</span>
        <small>CADA KILO CUENTA</small>
      </span>
    </div>
  );
}
const labels: Record<string, string> = {
  declared: "Por verificar",
  received: "En acopio",
  rejected: "Rechazado",
  transit: "En tránsito",
  delivered: "Entregado",
  prepared: "Preparado",
  awaiting_receipt: "Por recibir",
  pending: "Por pagar",
  paid: "Pagado",
};
export function Status({ value }: { value: string }) {
  return (
    <span className={"status " + value}>
      {value === "delivered" || value === "paid" ? <Check size={13} /> : null}
      {labels[value] || value}
    </span>
  );
}
export function Empty({
  title = "Todavía no hay registros",
  text = "Las nuevas operaciones aparecerán aquí.",
  children,
}: {
  title?: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Package size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      <span>Cargando tu espacio…</span>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ) || [],
        );
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <div>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    if (!active || !video.current) return;
    let alive = true;
    // Camera decoding is loaded only when requested; manual codes work offline.
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (!alive || !video.current) return;
        const reader = new BrowserQRCodeReader();
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result) => {
            if (alive && result) {
              onCodeRef.current(result.getText().trim());
              setActive(false);
            }
          },
        );
        if (alive) controls.current = c;
        else c.stop();
      })
      .catch(() => {
        if (!alive) return;
        setError(
          "No pudimos abrir la cámara. Revisa el permiso o escribe el código.",
        );
        setActive(false);
      });
    return () => {
      alive = false;
      controls.current?.stop();
      controls.current = null;
    };
  }, [active]);
  return (
    <div className="scanner">
      {active ? (
        <div className="camera">
          <video ref={video} autoPlay playsInline muted />
          <button className="button secondary" onClick={() => setActive(false)}>
            <CameraOff size={17} />
            Cerrar cámara
          </button>
        </div>
      ) : (
        <button
          className="button secondary full"
          onClick={() => {
            setError("");
            setActive(true);
          }}
        >
          <ScanLine size={19} />
          Escanear código QR
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) {
            onCode(code.trim());
            setCode("");
          }
        }}
      >
        <input
          aria-label="Código del lote"
          placeholder="O escribe el código del lote"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button className="button secondary" type="submit">
          Validar
        </button>
      </form>
    </div>
  );
}
export function PwaControls({
  refresh,
  onUpdate,
}: {
  refresh: boolean;
  onUpdate: () => Promise<void>;
}) {
  const { installed, canPrompt, busy } = useSyncExternalStore(
    installation.subscribe,
    installation.getSnapshot,
  );
  const [help, setHelp] = useState(false);
  return (
    <>
      {!installed && (
        <button
          className="install-button"
          disabled={busy}
          onClick={async () => {
            try {
              if ((await installation.install()) === "unavailable") setHelp(true);
            } catch {
              setHelp(true);
            }
          }}
        >
          <Download size={17} />
          <span>
            {busy
              ? "Abriendo instalación…"
              : canPrompt
                ? "Instalar EcoTrace"
                : "Cómo instalar EcoTrace"}
          </span>
        </button>
      )}
      {refresh && (
        <div className="update-banner">
          Hay una nueva versión disponible.
          <button onClick={onUpdate}>Actualizar</button>
        </div>
      )}
      {help && (
        <Modal title="EcoTrace, siempre a mano" onClose={() => setHelp(false)}>
          <div className="install-help">
            <Smartphone size={44} />
            <p>Instala EcoTrace para abrirla desde la pantalla de inicio.</p>
            <p>
              <strong>Android con Chrome:</strong> toca el menú ⋮ del navegador,
              elige «Instalar y crear acceso directo» y luego «Instalar».
              También puede aparecer como «Instalar aplicación» o «Agregar a
              pantalla de inicio».
            </p>
            <p>
              <strong>iPhone:</strong> abre la página en Safari, pulsa Compartir
              y luego «Agregar a pantalla de inicio». Si aparece «Abrir como
              app web», actívalo y pulsa «Agregar».
            </p>
            <small>
              Después, abre EcoTrace desde su icono en la pantalla de inicio.
              Si abriste el enlace dentro de otra aplicación, ábrelo primero
              en Chrome o Safari.
            </small>
          </div>
        </Modal>
      )}
    </>
  );
}
