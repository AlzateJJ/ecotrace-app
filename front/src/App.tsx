import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Truck,
  Wallet,
  Users,
  GraduationCap,
  Award,
  Settings,
  Plus,
  Bell,
  LogOut,
  ChevronDown,
  Leaf,
  ShieldCheck,
  WifiOff,
  RefreshCw,
  Menu,
  X,
  Mail,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import {
  api,
  ApiError,
  cacheData,
  cachedData,
  clearCachedUser,
  pendingDeliveries,
  syncDeliveries,
  connectionUnavailable,
} from "./api";
import { Logo, Loading, Modal, PwaControls, Field } from "./components";
import { roleNames, type Data, type Role, type Certificate } from "./types";
import { Dashboard } from "./Dashboard";
import { WorkspaceView } from "./Views";
import { Dialogs, type DialogState } from "./Dialogs";

export type Action = (type: string, value?: any) => void;
const navs: Record<
  Role,
  { id: string; label: string; icon: typeof Package }[]
> = {
  reciclador: [
    { id: "home", label: "Mi resumen", icon: LayoutDashboard },
    { id: "lots", label: "Mis entregas", icon: Package },
    { id: "payments", label: "Mis pagos", icon: Wallet },
  ],
  operario: [
    { id: "home", label: "Mi operación", icon: LayoutDashboard },
    { id: "lots", label: "Lotes e inventario", icon: Package },
    { id: "dispatches", label: "Despachos", icon: Truck },
  ],
  transportador: [
    { id: "home", label: "Mi ruta", icon: LayoutDashboard },
    { id: "dispatches", label: "Mis recogidas", icon: Truck },
    { id: "lots", label: "Lotes a cargo", icon: Package },
  ],
  empresa: [
    { id: "home", label: "Vista general", icon: LayoutDashboard },
    { id: "lots", label: "Trazabilidad", icon: Package },
    { id: "certificates", label: "Certificados", icon: Award },
    { id: "payments", label: "Liquidaciones", icon: Wallet },
  ],
  capacitador: [
    { id: "home", label: "Adopción", icon: LayoutDashboard },
    { id: "team", label: "Acompañamiento", icon: Users },
    { id: "workshops", label: "Talleres", icon: GraduationCap },
  ],
  admin: [
    { id: "home", label: "Vista general", icon: LayoutDashboard },
    { id: "users", label: "Usuarios y sedes", icon: Users },
    { id: "lots", label: "Trazabilidad", icon: Package },
    { id: "certificates", label: "Certificados", icon: Award },
    { id: "payments", label: "Liquidaciones", icon: Wallet },
  ],
};
export default function App() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineData, setOfflineData] = useState(false);
  const [pending, setPending] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [demo, setDemo] = useState(false);
  const [loadError, setLoadError] = useState("");
  const publicCode = window.location.pathname.startsWith("/verify/")
    ? window.location.pathname.split("/")[2]
    : null;
  const flash = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Data>("/bootstrap");
      setData(next);
      setOfflineData(false);
      setLoadError("");
      await cacheData(next);
      setPending((await pendingDeliveries(next.user.id)).length);
      return next;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setData(null);
          await clearCachedUser();
          return null;
        }
        if (!connectionUnavailable(e)) throw e;
      }
      const cached = await cachedData();
      if (cached) {
        setData(cached);
        setOfflineData(true);
        setPending((await pendingDeliveries(cached.user.id)).length);
        return cached;
      }
      throw e;
    }
  }, []);
  useEffect(() => {
    if (publicCode) {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() =>
        setLoadError(
          "No pudimos conectar con EcoTrace. Comprueba que la API esté disponible.",
        ),
      )
      .finally(() => setLoading(false));
    api("/auth/config")
      .then((c) => setDemo(c.demo))
      .catch(() => {});
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh, publicCode]);
  const sync = useCallback(async () => {
    if (!data) return;
    try {
      const count = await syncDeliveries(data.user.id);
      await refresh();
      if (count) flash(`${count} entrega(s) sincronizada(s).`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "No se pudo sincronizar.");
    }
  }, [data?.user.id, refresh, flash]);
  useEffect(() => {
    if (online && data) void sync();
  }, [online, data?.user.id]);
  useEffect(() => {
    if (!data || !online) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [data?.user.id, online, refresh]);
  const action: Action = (type, value) => {
    if (type === "navigate") {
      setPage(value);
      setMobile(false);
    } else setDialog({ type, value });
  };
  const mutate = async (path: string, method: string, body?: unknown) => {
    if (!online) throw new Error("Esta operación necesita conexión.");
    const result = await api(path, method, body);
    await refresh().catch(() =>
      flash(
        "La operación se guardó. Actualiza cuando se restablezca la conexión.",
      ),
    );
    return result;
  };
  const logout = async () => {
    if (!online) {
      flash("Conéctate a internet para cerrar y revocar tu sesión.");
      return;
    }
    try {
      await api("/logout", "POST");
      await clearCachedUser();
      setData(null);
      setPage("home");
      setMobile(false);
      setDialog(null);
    } catch (e) {
      flash((e as Error).message);
    }
  };
  if (publicCode) return <PublicCertificate code={publicCode} />;
  if (loading)
    return (
      <div className="initial-loading">
        <Logo />
        <Loading />
      </div>
    );
  if (!data)
    return (
      <Login
        error={loadError}
        onLogin={async () => {
          setLoading(true);
          try {
            await refresh();
            setPage("home");
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  const nav = navs[data.user.role];
  const current = nav.find((n) => n.id === page) || nav[0];
  const unread = data.notifications.filter((n) => !n.read_at).length;
  const initials = data.user.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "visible" : "")}>
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Cerrar menú"
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">TU ESPACIO</div>
        <button
          className="workspace-selector"
          onClick={() => action("profile")}
        >
          <span className="workspace-icon">
            <Leaf size={20} />
          </span>
          <span>
            <strong>{data.user.site_name || data.organization.name}</strong>
            <small>{roleNames[data.user.role]}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="Navegación principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => {
                setPage(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "lots" && data.user.role === "reciclador" && (
                <span className="nav-count">{data.lots.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="circular-note">
            <span className="tiny-leaf">
              <Leaf size={16} />
            </span>
            <strong>Un nuevo ciclo empieza contigo.</strong>
            <p>Conectamos personas para darle otra vida al PET.</p>
            <PwaControls />
          </div>
          <button className="sidebar-link" onClick={() => action("profile")}>
            <Settings size={19} />
            Mi cuenta
          </button>
          <button className="sidebar-profile" onClick={() => action("profile")}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{data.user.name}</strong>
              <small>{roleNames[data.user.role]}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <button className="logout" onClick={logout}>
            <LogOut size={15} />
            {demo ? "Cambiar perfil de ejemplo" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Cerrar menú"
          className="sidebar-overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Mi espacio</span>
            <span className="slash">/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="topbar-actions">
            {demo && <span className="demo-label">Demostración</span>}
            <span className="connection">
              <span
                className={
                  online && !offlineData
                    ? "connection-dot"
                    : "connection-dot offline"
                }
              />
              {online && !offlineData ? "En línea" : "Sin conexión"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label={`Notificaciones: ${unread} sin leer`}
              onClick={() => {
                action("notifications");
                if (online)
                  mutate("/notifications/read", "POST").catch((e) =>
                    flash(e.message),
                  );
              }}
            >
              <Bell size={21} />
              {unread > 0 && <i />}
            </button>
            <button
              className="avatar small"
              aria-label="Mi cuenta"
              onClick={() => action("profile")}
            >
              {initials}
            </button>
          </div>
        </header>
        {(!online || offlineData || pending > 0) && (
          <div className="offline-banner">
            <WifiOff size={17} />
            <span>
              {pending
                ? `${pending} entrega(s) guardada(s) en este dispositivo, pendientes de sincronizar.`
                : "Estás viendo la última información guardada. Puedes preparar una entrega sin conexión."}
            </span>
            {online && (
              <button onClick={sync}>
                <RefreshCw size={16} />
                Sincronizar
              </button>
            )}
          </div>
        )}
        <main>
          {page === "home" ? (
            <Dashboard data={data} action={action} />
          ) : (
            <WorkspaceView key={page} page={page} data={data} action={action} />
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} />
              EcoTrace · Conectados por un futuro circular
            </span>
            <span>{data.organization.name}</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <Dialogs
          dialog={dialog}
          data={data}
          online={online}
          onClose={() => setDialog(null)}
          action={action}
          mutate={mutate}
          refresh={refresh}
          flash={flash}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {toast}
          <button aria-label="Cerrar mensaje" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Login({
  onLogin,
  error,
}: {
  onLogin: () => Promise<void>;
  error: string;
}) {
  const [config, setConfig] = useState<{
    demo: boolean;
    users: { id: string; name: string; role: Role; site: string | null }[];
  }>({ demo: false, users: [] });
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [development, setDevelopment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error);
  const [showDemo, setShowDemo] = useState(true);
  useEffect(() => {
    api("/auth/config")
      .then(setConfig)
      .catch(() =>
        setMessage(
          "La API no está disponible. Intenta de nuevo en unos momentos.",
        ),
      );
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-layout">
      <section className="login-story">
        <Logo light />
        <div className="story-content">
          <span className="eyebrow light">EL VALOR DE VOLVER A EMPEZAR</span>
          <h1>
            Un nuevo ciclo.
            <br />
            Un futuro
            <br />
            <em>compartido.</em>
          </h1>
          <p>
            Cada botella tiene una historia.
            <br />
            Hagamos que continúe.
          </p>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="bottle">
              <div className="bottle-cap" />
              <div className="bottle-neck" />
              <div className="bottle-body">
                <Leaf size={54} />
                <span>PET</span>
              </div>
            </div>
            <span className="orbit-tag tag-one">
              <Package size={18} />
              Cada kilo, con origen
            </span>
            <span className="orbit-tag tag-two">
              <Leaf size={18} />
              Cada persona cuenta
            </span>
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={20} />
          Trazabilidad que conecta. Confianza que crece.
        </div>
      </section>
      <section className="login-form">
        <div className="mobile-login-brand">
          <Logo />
        </div>
        <div className="login-card">
          <span className="eyebrow">BIENVENIDO A ECOTRACE</span>
          <h2>
            Tu aporte hace
            <br />
            la diferencia.
          </h2>
          <p>Ingresa a tu espacio y sigamos construyendo un futuro circular.</p>
          {config.demo && (
            <div className="login-tabs">
              <button
                className={showDemo ? "active" : ""}
                onClick={() => setShowDemo(true)}
              >
                Explorar la demo
              </button>
              <button
                className={!showDemo ? "active" : ""}
                onClick={() => setShowDemo(false)}
              >
                Ingresar con correo
              </button>
            </div>
          )}
          {config.demo && showDemo ? (
            <>
              <div className="demo-profiles">
                {config.users.map((u) => (
                  <button
                    disabled={busy}
                    className="demo-profile"
                    key={u.id}
                    onClick={() =>
                      run(async () => {
                        await api("/auth/demo", "POST", { userId: u.id });
                        await onLogin();
                      })
                    }
                  >
                    <span className={"role-avatar " + u.role}>
                      {u.role === "reciclador" ? (
                        <Leaf />
                      ) : u.role === "transportador" ? (
                        <Truck />
                      ) : u.role === "empresa" ? (
                        <Award />
                      ) : u.role === "capacitador" ? (
                        <GraduationCap />
                      ) : u.role === "admin" ? (
                        <ShieldCheck />
                      ) : (
                        <Package />
                      )}
                    </span>
                    <span>
                      <strong>
                        {u.site === "planta-medellin"
                          ? "Recepción en planta"
                          : roleNames[u.role]}
                      </strong>
                      <small>{u.name}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
              <p className="demo-footnote">
                Datos de ejemplo. Puedes probar las operaciones y sus permisos
                desde cada perfil.
              </p>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (!challenge) {
                    const r = await api("/auth/request-code", "POST", {
                      email,
                    });
                    setChallenge(r.challenge);
                    setDevelopment(r.developmentCode || "");
                    setMessage(r.message);
                  } else {
                    await api("/auth/verify", "POST", { challenge, code });
                    await onLogin();
                  }
                });
              }}
            >
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@organizacion.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!challenge}
                />
              </Field>
              {challenge && (
                <Field label="Código de verificación">
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
              )}
              {development && (
                <p className="info-box">
                  Código solo para desarrollo: <strong>{development}</strong>
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                <Mail size={18} />
                {busy
                  ? "Un momento…"
                  : challenge
                    ? "Entrar a mi espacio"
                    : "Enviar código de acceso"}
              </button>
              {challenge && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setChallenge("");
                    setCode("");
                    setDevelopment("");
                    setMessage("");
                  }}
                >
                  Solicitar otro código
                </button>
              )}
              <p className="demo-footnote">
                Tu organización debe habilitar tu cuenta antes del primer
                ingreso.
              </p>
            </form>
          )}
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
        </div>
        <div className="login-bottom">
          Material que se transforma. Historias que continúan.
        </div>
      </section>
    </div>
  );
}
function PublicCertificate({ code }: { code: string }) {
  const [c, setC] = useState<Certificate | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Certificate>("/verify/" + encodeURIComponent(code))
      .then(setC)
      .catch((e) => setError(e.message));
  }, [code]);
  return (
    <div className="public-certificate">
      <Logo />
      {error ? (
        <p className="form-error">{error}</p>
      ) : c ? (
        <>
          <div className="certificate-seal">
            <Award size={48} />
          </div>
          <span className="eyebrow">REGISTRO VERIFICADO</span>
          <h1>Certificado de origen</h1>
          <p>{c.id}</p>
          <h2>
            {c.snapshot.kg} kg de {c.snapshot.material}
          </h2>
          <dl>
            <dt>Lote</dt>
            <dd>{c.snapshot.lot_id}</dd>
            <dt>Origen</dt>
            <dd>{c.snapshot.origin}</dd>
            <dt>Destino</dt>
            <dd>{c.snapshot.destination}</dd>
            <dt>Asociación</dt>
            <dd>{c.snapshot.association}</dd>
          </dl>
          <p>
            Verifica los registros de recepción en EcoTrace. No constituye una
            certificación ambiental de un tercero.
          </p>
        </>
      ) : (
        <Loading />
      )}
      <a href="/">Ir a EcoTrace</a>
    </div>
  );
}
