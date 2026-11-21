import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  CheckCircle2,
  Package,
  Scale,
  MapPin,
  Plus,
  Minus,
  Truck,
  Wallet,
  Download,
  Award,
  MessageCircle,
  Users,
  Bell,
  WifiOff,
  AlertCircle,
  Leaf,
} from "lucide-react";
import { api, connectionUnavailable, queueDelivery } from "./api";
import {
  type Data,
  type DeliveryDraft,
  type Lot,
  type Dispatch,
  type Workshop,
  type Certificate,
  type TeamMember,
  roleNames,
} from "./types";
import {
  date,
  Empty,
  Field,
  Loading,
  Modal,
  money,
  number,
  Scanner,
  Status,
} from "./components";
import type { Action } from "./App";
export interface DialogState {
  type: string;
  value?: any;
}
interface Props {
  dialog: DialogState;
  data: Data;
  online: boolean;
  onClose: () => void;
  action: Action;
  mutate: (path: string, method: string, body?: unknown) => Promise<any>;
  refresh: () => Promise<unknown>;
  flash: (message: string) => void;
}
function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
function ErrorMessage({ text }: { text: string }) {
  return text ? (
    <div className="form-error" role="alert">
      <AlertCircle size={17} />
      {text}
    </div>
  ) : null;
}
export function Dialogs(p: Props) {
  const { dialog: d, data, action, onClose, mutate, flash } = p;
  const done = (message: string) => {
    flash(message);
    onClose();
  };
  if (d.type === "newDelivery") return <NewDelivery {...p} />;
  if (d.type === "lot") return <LotDetail {...p} lotId={d.value} />;
  if (d.type === "scan") return <ScanDialog {...p} />;
  if (d.type === "newDispatch") return <NewDispatch {...p} />;
  if (d.type === "dispatch")
    return <DispatchDetail {...p} dispatch={d.value} />;
  if (d.type === "attendance")
    return <AttendanceDialog {...p} workshop={d.value} />;
  if (d.type === "certificate")
    return <CertificateDialog certificate={d.value} onClose={onClose} />;
  if (d.type === "person")
    return <PersonDialog person={d.value} onClose={onClose} />;
  if (d.type === "notifications")
    return (
      <Modal
        title="Tus notificaciones"
        subtitle="Lo que está pasando con tu aporte."
        onClose={onClose}
      >
        {data.notifications.length ? (
          data.notifications.map((n) => (
            <div className="notice-row" key={n.id}>
              <span>
                <Bell size={21} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{date(n.created_at, true)}</small>
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="Todo al día"
            text="Te avisaremos cuando haya novedades."
          />
        )}
      </Modal>
    );
  if (d.type === "profile")
    return (
      <SimpleForm
        title="Mi cuenta"
        onClose={onClose}
        onSubmit={async (f) => {
          await mutate("/profile", "PATCH", {
            name: f.get("name"),
            phone: f.get("phone"),
            ...(data.user.role === "reciclador"
              ? { paymentAccount: f.get("paymentAccount") }
              : {}),
          });
          done("Tus datos se guardaron.");
        }}
      >
        <div className="profile-summary">
          <span className="avatar large">
            {data.user.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <strong>{roleNames[data.user.role]}</strong>
            <p>{data.user.email}</p>
            <small>{data.user.association || data.organization.name}</small>
          </div>
        </div>
        <Field label="Nombre">
          <input
            name="name"
            required
            minLength={2}
            maxLength={200}
            defaultValue={data.user.name}
          />
        </Field>
        <Field label="Celular">
          <input
            name="phone"
            type="tel"
            maxLength={25}
            defaultValue={data.user.phone}
          />
        </Field>
        {data.user.role === "reciclador" && (
          <Field
            label="Cuenta para pagos"
            hint="Esta información permite identificar el destino acordado del pago."
          >
            <input
              name="paymentAccount"
              maxLength={120}
              defaultValue={data.user.payment_account}
              placeholder="Banco o billetera · número"
            />
          </Field>
        )}
        <Field label="Tamaño de letra">
          <select
            defaultValue={localStorage.getItem("ecotrace-font") || "16"}
            onChange={(e) => {
              document.documentElement.style.fontSize = e.target.value + "px";
              localStorage.setItem("ecotrace-font", e.target.value);
            }}
          >
            <option value="16">Normal</option>
            <option value="18">Grande</option>
            <option value="20">Muy grande</option>
          </select>
        </Field>
      </SimpleForm>
    );
  if (d.type === "payment")
    return (
      <SimpleForm
        title="Registrar comprobante de pago"
        onClose={onClose}
        submitLabel="Confirmar pago registrado"
        onSubmit={async (f) => {
          await mutate("/payments/" + d.value.id + "/paid", "POST", {
            reference: f.get("reference"),
          });
          done("Comprobante de pago registrado.");
        }}
      >
        <div className="amount-summary">
          <Wallet />
          <strong>{money(d.value.amount)}</strong>
          <p>
            {d.value.owner_name} · {d.value.lot_id}
          </p>
        </div>
        <p className="info-box">
          Registra aquí un pago realizado fuera de EcoTrace. Esta acción no
          envía dinero.
        </p>
        <Field label="Referencia del comprobante">
          <input
            required
            name="reference"
            minLength={4}
            maxLength={120}
            placeholder="Ej. TRANSFERENCIA-12345"
          />
        </Field>
      </SimpleForm>
    );
  if (d.type === "goal")
    return (
      <SimpleForm
        title="Meta de recuperación"
        onClose={onClose}
        onSubmit={async (f) => {
          await mutate("/organization", "PATCH", {
            goalKg: Number(f.get("goal")),
          });
          done("Meta actualizada.");
        }}
      >
        <p>
          Define la meta acumulada de PET recibido en planta para tu
          organización.
        </p>
        <Field label="Meta en kilogramos">
          <input
            name="goal"
            type="number"
            min="0.01"
            max="50000"
            step="0.01"
            required
            defaultValue={data.organization.goal_kg}
          />
        </Field>
      </SimpleForm>
    );
  if (d.type === "newWorkshop")
    return (
      <SimpleForm
        title="Crear taller"
        onClose={onClose}
        submitLabel="Programar taller"
        onSubmit={async (f) => {
          await mutate("/workshops", "POST", {
            name: f.get("name"),
            location: f.get("location"),
            startsAt: new Date(String(f.get("date"))).toISOString(),
            targetRole: f.get("role"),
          });
          done("Taller creado y participantes inscritos.");
        }}
      >
        <Field label="Nombre del taller">
          <input
            name="name"
            required
            minLength={2}
            maxLength={200}
            placeholder="Ej. Primeros pasos en EcoTrace"
          />
        </Field>
        <Field label="Lugar">
          <input
            name="location"
            required
            minLength={2}
            maxLength={200}
            placeholder="Centro de acopio o enlace de reunión"
          />
        </Field>
        <Field label="Fecha y hora">
          <input name="date" type="datetime-local" required />
        </Field>
        <Field
          label="Grupo de participantes"
          hint="Se inscribe a los usuarios activos de este rol en tu organización."
        >
          <select name="role">
            <option value="reciclador">Recicladores</option>
            <option value="operario">Operarios</option>
            <option value="transportador">Transportadores</option>
          </select>
        </Field>
      </SimpleForm>
    );
  if (d.type === "newSite")
    return (
      <SimpleForm
        title="Crear sede"
        onClose={onClose}
        onSubmit={async (f) => {
          await mutate("/sites", "POST", {
            name: f.get("name"),
            kind: f.get("kind"),
            address: f.get("address"),
          });
          done("Sede creada.");
        }}
      >
        <Field label="Nombre">
          <input name="name" required minLength={2} maxLength={200} />
        </Field>
        <Field label="Tipo">
          <select name="kind">
            <option value="center">Centro de acopio</option>
            <option value="plant">Planta transformadora</option>
          </select>
        </Field>
        <Field label="Dirección">
          <input name="address" required minLength={2} maxLength={200} />
        </Field>
      </SimpleForm>
    );
  if (d.type === "newUser") return <NewUser {...p} />;
  if (d.type === "toggleUser")
    return (
      <SimpleForm
        title={d.value.active ? "Deshabilitar acceso" : "Habilitar acceso"}
        onClose={onClose}
        submitLabel="Confirmar cambio"
        onSubmit={async () => {
          await mutate("/users/" + d.value.id, "PATCH", {
            active: !d.value.active,
          });
          done("Acceso actualizado.");
        }}
      >
        <p>
          {d.value.active
            ? `Se cerrarán las sesiones de ${d.value.name}. Sus registros se conservarán.`
            : `${d.value.name} podrá volver a ingresar con su correo.`}
        </p>
      </SimpleForm>
    );
  return null;
}
function SimpleForm({
  title,
  onClose,
  onSubmit,
  children,
  submitLabel = "Guardar cambios",
}: {
  title: string;
  onClose: () => void;
  onSubmit: (f: FormData) => Promise<void>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const op = useOperation();
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          void op.run(() => onSubmit(values));
        }}
      >
        {children}
        <ErrorMessage text={op.error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={op.busy}>
            {op.busy ? "Guardando…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function NewDelivery(p: Props) {
  const [step, setStep] = useState(1);
  const [materialId, setMaterial] = useState(
    p.data.materials.find((m) => m.id === "pet-clear")?.id ||
      p.data.materials[0]?.id ||
      "",
  );
  const [centerId, setCenter] = useState(
    p.data.sites.find((s) => s.kind === "center")?.id || "",
  );
  const [kg, setKg] = useState("");
  const [clientId] = useState(crypto.randomUUID());
  const op = useOperation();
  const material = p.data.materials.find((m) => m.id === materialId);
  const center = p.data.sites.find((s) => s.id === centerId);
  const valid = Number(kg) > 0 && Number(kg) <= 50000;
  const save = async () => {
    const draft: DeliveryDraft = {
      clientId,
      materialId,
      centerId,
      declaredKg: Number(kg),
    };
    if (!p.online) {
      await queueDelivery(p.data.user.id, draft);
      await p.refresh();
      p.flash(
        "Entrega guardada en el dispositivo. Se enviará al recuperar conexión.",
      );
      p.onClose();
      return;
    }
    try {
      const result = await p.mutate("/lots", "POST", draft);
      p.flash("Entrega registrada. Muestra tu QR en el centro.");
      p.action("lot", result.id);
    } catch (e) {
      if (connectionUnavailable(e)) {
        await queueDelivery(p.data.user.id, draft);
        await p.refresh();
        p.flash(
          "La conexión se interrumpió. Guardamos la entrega para sincronizar.",
        );
        p.onClose();
      } else throw e;
    }
  };
  return (
    <Modal
      title="Registrar una entrega"
      subtitle="Tu material está a punto de empezar un nuevo ciclo."
      onClose={p.onClose}
    >
      <div className="stepper">
        {["Material y peso", "Centro de acopio", "Confirmación"].map((s, i) => (
          <div key={s} className={step >= i + 1 ? "active" : ""}>
            <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            <small>{s}</small>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) setStep(step + 1);
          else op.run(save);
        }}
      >
        {step === 1 ? (
          <>
            <h3>¿Qué vas a entregar?</h3>
            <div className="material-options">
              {p.data.materials.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={
                    "material-option " + (m.id === materialId ? "selected" : "")
                  }
                  onClick={() => setMaterial(m.id)}
                >
                  <span className="material-art">
                    <Package size={26} />
                  </span>
                  <span>
                    <strong>{m.name}</strong>
                    <small>{money(m.price)} / kg</small>
                  </span>
                  <span className="selection-circle">
                    {m.id === materialId && <Check size={14} />}
                  </span>
                </button>
              ))}
            </div>
            <Field
              label="¿Cuántos kilos aproximadamente?"
              hint="En el centro de acopio confirmaremos el peso final."
            >
              <div className="weight-input">
                <button
                  type="button"
                  aria-label="Restar un kilo"
                  onClick={() => setKg(String(Math.max(1, Number(kg) - 1)))}
                >
                  <Minus size={20} />
                </button>
                <input
                  type="number"
                  required
                  min="0.01"
                  max="50000"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
                <span>kg</span>
                <button
                  type="button"
                  aria-label="Agregar un kilo"
                  onClick={() => setKg(String(Math.min(50000, Number(kg) + 1)))}
                >
                  <Plus size={20} />
                </button>
              </div>
            </Field>
          </>
        ) : step === 2 ? (
          <>
            <h3>Elige tu centro de acopio</h3>
            <div className="center-options">
              {p.data.sites
                .filter((s) => s.kind === "center")
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={
                      "center-option " + (s.id === centerId ? "selected" : "")
                    }
                    onClick={() => setCenter(s.id)}
                  >
                    <MapPin size={24} />
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.address}</small>
                    </span>
                    <span className="selection-circle">
                      {s.id === centerId && <Check size={14} />}
                    </span>
                  </button>
                ))}
            </div>
            {!center && (
              <p className="info-box">
                Tu organización debe registrar un centro de acopio.
              </p>
            )}
          </>
        ) : (
          <>
            <h3>Todo listo para tu entrega</h3>
            <dl className="summary-list">
              <dt>Material</dt>
              <dd>{material?.name}</dd>
              <dt>Peso aproximado</dt>
              <dd>{number(Number(kg))} kg</dd>
              <dt>Centro</dt>
              <dd>{center?.name}</dd>
            </dl>
            <div className="estimate">
              <span>Valor estimado de tu entrega</span>
              <strong>{money(Number(kg) * (material?.price || 0))}</strong>
              <small>
                + {Math.floor(Number(kg) * Number(material?.points || 0))}{" "}
                EcoPuntos al verificar la entrega
              </small>
            </div>
            <p className="subtle">
              El valor final depende del peso aceptado en el centro. Esta
              estimación no es un pago confirmado.
            </p>
            {!p.online && (
              <p className="info-box">
                <WifiOff size={16} />
                Se guardará en este dispositivo. El QR estará disponible cuando
                se sincronice.
              </p>
            )}
          </>
        )}
        <ErrorMessage text={op.error} />
        <div className="modal-actions">
          {step > 1 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep(step - 1)}
            >
              Volver
            </button>
          ) : (
            <button
              type="button"
              className="button secondary"
              onClick={p.onClose}
            >
              Cancelar
            </button>
          )}
          <button
            className="button primary"
            disabled={op.busy || !valid || !material || !center}
          >
            {op.busy
              ? "Guardando…"
              : step === 3
                ? p.online
                  ? "Confirmar entrega"
                  : "Guardar sin conexión"
                : "Continuar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ScanDialog(p: Props) {
  const [error, setError] = useState("");
  return (
    <Modal
      title="Recibir material"
      subtitle="Escanea el QR del reciclador o escribe su código."
      onClose={p.onClose}
    >
      <Scanner
        onCode={async (code) => {
          try {
            await api("/lots/" + encodeURIComponent(code));
            p.action("lot", code);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <ErrorMessage text={error} />
    </Modal>
  );
}
function LotDetail(p: Props & { lotId: string }) {
  const [lot, setLot] = useState<Lot | undefined>(
    p.data.lots.find((l) => l.id === p.lotId),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [incident, setIncident] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const op = useOperation();
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Lot>("/lots/" + encodeURIComponent(p.lotId))
      .then((l) => {
        if (active) {
          setLot(l);
          setLoadError("");
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [p.lotId]);
  return (
    <Modal
      title={p.lotId}
      subtitle="El recorrido de tu material"
      onClose={p.onClose}
      wide
    >
      {!lot ? (
        loading ? (
          <Loading />
        ) : (
          <ErrorMessage text={loadError} />
        )
      ) : (
        <>
          <div className="lot-detail-top">
            <div className="detail-weight">
              <Package />
              <strong>
                {number(lot.verified_kg ?? lot.declared_kg)} <small>kg</small>
              </strong>
              <p>{lot.material_name}</p>
            </div>
            <Status value={lot.status} />
          </div>
          <dl className="summary-list">
            <dt>Reciclador</dt>
            <dd>{lot.owner_name}</dd>
            <dt>Centro</dt>
            <dd>{lot.center_name}</dd>
            <dt>Peso declarado</dt>
            <dd>{number(lot.declared_kg)} kg</dd>
            {lot.verified_kg && (
              <>
                <dt>Peso verificado</dt>
                <dd>{number(lot.verified_kg)} kg</dd>
              </>
            )}
            {lot.destination_kg && (
              <>
                <dt>Recibido en planta</dt>
                <dd>{number(lot.destination_kg)} kg</dd>
              </>
            )}
            <dt>Fecha de registro</dt>
            <dd>{date(lot.created_at, true)}</dd>
          </dl>
          {p.data.user.role === "reciclador" && lot.status === "declared" && (
            <div className="qr-panel">
              <QRCodeSVG value={lot.id} size={180} level="M" marginSize={2} />
              <strong>Muestra este código al operario</strong>
              <small>{lot.id} · Pendiente de pesaje</small>
            </div>
          )}
          {p.data.user.role === "operario" &&
            lot.status === "declared" &&
            lot.center_id === p.data.user.site_id &&
            !receipt && (
              <button
                className="button primary full"
                disabled={!p.online}
                onClick={() => setReceipt(true)}
              >
                <Scale size={19} />
                Verificar peso y recibir
              </button>
            )}
          {receipt && (
            <form
              className="receipt-form form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                op.run(async () => {
                  await p.mutate("/lots/" + lot.id + "/receive", "POST", {
                    accepted,
                    ...(accepted
                      ? { verifiedKg: Number(f.get("weight")) }
                      : {}),
                    note: f.get("note"),
                  });
                  p.flash(
                    accepted
                      ? "Recepción confirmada y liquidación creada."
                      : "Rechazo registrado.",
                  );
                  p.onClose();
                });
              }}
            >
              <h3>Verificación del centro</h3>
              <Field label="Calidad del material">
                <select
                  value={accepted ? "accepted" : "rejected"}
                  onChange={(e) => setAccepted(e.target.value === "accepted")}
                >
                  <option value="accepted">Aceptado</option>
                  <option value="rejected">Rechazado</option>
                </select>
              </Field>
              {accepted && (
                <Field label="Peso en báscula (kg)">
                  <input
                    name="weight"
                    type="number"
                    min="0.01"
                    max="50000"
                    step="0.01"
                    defaultValue={lot.declared_kg}
                    required
                  />
                </Field>
              )}
              <Field
                label={
                  accepted ? "Observaciones de pesaje" : "Motivo del rechazo"
                }
                hint="Si cambia el peso, explica la diferencia."
              >
                <textarea
                  name="note"
                  rows={3}
                  maxLength={1000}
                  required={!accepted}
                />
              </Field>
              <ErrorMessage text={op.error} />
              <button disabled={op.busy} className="button primary">
                {op.busy
                  ? "Guardando…"
                  : accepted
                    ? "Confirmar recepción"
                    : "Confirmar rechazo"}
              </button>
            </form>
          )}
          <h3 className="detail-section-title">Trazabilidad</h3>
          {loading ? (
            <Loading />
          ) : loadError ? (
            <p className="info-box">
              El historial necesita conexión. Se muestran los datos guardados.
            </p>
          ) : (
            <div className="timeline">
              {lot.events?.map((e) => (
                <div key={e.id}>
                  <span
                    className={
                      "timeline-dot " +
                      (e.action === "incident" || e.action === "rejected"
                        ? "warning"
                        : "")
                    }
                  >
                    <Check size={13} />
                  </span>
                  <div>
                    <strong>{e.detail}</strong>
                    <small>
                      {e.actor_name} · {date(e.created_at, true)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
          {lot.incidents && lot.incidents.length > 0 && (
            <div className="incident-list">
              <h3>Novedades registradas</h3>
              {lot.incidents.map((i) => (
                <p key={i.id}>
                  {i.description}
                  <small>{i.reporter_name}</small>
                </p>
              ))}
            </div>
          )}
          {incident ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                op.run(async () => {
                  await p.mutate("/lots/" + lot.id + "/incidents", "POST", {
                    description: f.get("description"),
                  });
                  p.flash("Novedad registrada en la trazabilidad.");
                  p.onClose();
                });
              }}
            >
              <Field label="Describe la novedad">
                <textarea
                  required
                  name="description"
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
              <ErrorMessage text={op.error} />
              <button className="button primary" disabled={op.busy}>
                Registrar novedad
              </button>
            </form>
          ) : (
            <button
              disabled={!p.online}
              className="text-button"
              onClick={() => setIncident(true)}
            >
              <AlertCircle size={16} />
              Reportar una novedad
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
function NewDispatch(p: Props) {
  const [selection, setSelection] = useState<string[]>([]);
  const available = p.data.lots.filter(
    (l) =>
      l.status === "received" &&
      !l.dispatch_id &&
      l.center_id === p.data.user.site_id,
  );
  return (
    <SimpleForm
      title="Preparar un despacho"
      onClose={p.onClose}
      submitLabel="Confirmar despacho"
      onSubmit={async (f) => {
        await p.mutate("/dispatches", "POST", {
          lotIds: selection,
          destinationId: f.get("destination"),
          transporterId: f.get("transporter"),
          scheduledDate: f.get("date"),
          timeWindow: f.get("window"),
        });
        p.flash("Despacho asignado al transportador.");
        p.onClose();
      }}
    >
      <h3>Selecciona los lotes que salen</h3>
      {available.length ? (
        <div className="check-list">
          {available.map((l) => (
            <label key={l.id}>
              <input
                type="checkbox"
                checked={selection.includes(l.id)}
                onChange={(e) =>
                  setSelection(
                    e.target.checked
                      ? [...selection, l.id]
                      : selection.filter((x) => x !== l.id),
                  )
                }
              />
              <span>
                <strong>{l.id}</strong>
                <small>{l.material_name}</small>
              </span>
              <b>{number(l.verified_kg || 0)} kg</b>
            </label>
          ))}
        </div>
      ) : (
        <p className="info-box">
          No hay lotes verificados disponibles. Recibe material primero.
        </p>
      )}
      <div className="selection-total">
        {selection.length} lotes seleccionados{" "}
        <strong>
          {number(
            available
              .filter((l) => selection.includes(l.id))
              .reduce((s, l) => s + Number(l.verified_kg), 0),
          )}{" "}
          kg
        </strong>
      </div>
      <Field label="Planta de destino">
        <select name="destination" required>
          <option value="">Selecciona una planta</option>
          {p.data.sites
            .filter((s) => s.kind === "plant")
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Transportador">
        <select name="transporter" required>
          <option value="">Selecciona un transportador</option>
          {p.data.transporters.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-columns">
        <Field label="Fecha">
          <input
            name="date"
            type="date"
            required
            defaultValue={new Date().toLocaleDateString("en-CA")}
          />
        </Field>
        <Field label="Ventana de cargue">
          <input
            name="window"
            required
            minLength={3}
            maxLength={50}
            placeholder="06:30–07:30"
          />
        </Field>
      </div>
    </SimpleForm>
  );
}
function DispatchDetail(p: Props & { dispatch: Dispatch }) {
  const d = p.dispatch;
  const [scanned, setScanned] = useState<string[]>([]);
  const [scanError, setScanError] = useState("");
  const op = useOperation();
  const carrier = p.data.user.role === "transportador";
  const receiver =
    p.data.user.role === "operario" && p.data.user.site_id === d.destination_id;
  const perform = (suffix: string, body?: unknown) =>
    op.run(async () => {
      await p.mutate("/dispatches/" + d.id + "/" + suffix, "POST", body);
      p.flash(
        suffix === "load"
          ? "Carga confirmada. Buen viaje."
          : suffix === "arrive"
            ? "Llegada registrada. La planta confirmará la recepción."
            : "Recepción en planta y certificados confirmados.",
      );
      p.onClose();
    });
  return (
    <Modal
      title={d.id}
      subtitle="La trazabilidad continúa en cada traslado."
      onClose={p.onClose}
    >
      <div className="dispatch-detail-status">
        <Truck size={32} />
        <Status value={d.status} />
      </div>
      <dl className="summary-list">
        <dt>Origen</dt>
        <dd>{d.origin_name}</dd>
        <dt>Destino</dt>
        <dd>{d.destination_name}</dd>
        <dt>Transportador</dt>
        <dd>{d.transporter_name}</dd>
        <dt>Cargue</dt>
        <dd>
          {date(d.scheduled_date.slice(0, 10) + "T12:00:00Z")} · {d.time_window}
        </dd>
      </dl>
      <h3>Material del despacho</h3>
      <div className="dispatch-lots">
        {d.lots.map((l) => (
          <div key={l.id}>
            <span
              className={
                "scan-check " + (scanned.includes(l.id) ? "checked" : "")
              }
            >
              <Check size={15} />
            </span>
            <button
              className="text-button"
              onClick={() => p.action("lot", l.id)}
            >
              {l.id}
            </button>
            <strong>{number(l.verified_kg || 0)} kg</strong>
          </div>
        ))}
      </div>
      {carrier && d.status === "prepared" && (
        <>
          <p className="subtle">
            Escanea o escribe el código de cada lote antes de confirmar la
            carga.
          </p>
          <Scanner
            onCode={(code) => {
              if (!d.lots.some((l) => l.id === code)) {
                setScanError("Ese lote no está asignado a este despacho.");
                return;
              }
              setScanError("");
              setScanned((s) => (s.includes(code) ? s : [...s, code]));
            }}
          />
          <ErrorMessage text={scanError} />
          <p className="selection-total">
            {scanned.length} de {d.lots.length} lotes confirmados
          </p>
          <button
            disabled={op.busy || scanned.length !== d.lots.length || !p.online}
            className="button primary full"
            onClick={() => perform("load", { scannedLotIds: scanned })}
          >
            Confirmar carga e iniciar viaje
          </button>
        </>
      )}
      {carrier && d.status === "transit" && (
        <button
          className="button primary full"
          disabled={op.busy || !p.online}
          onClick={() => perform("arrive")}
        >
          <MapPin size={18} />
          Llegué a la planta
        </button>
      )}
      {d.status === "awaiting_receipt" && !receiver && (
        <p className="info-box">
          La planta debe verificar los pesos y confirmar la recepción para
          cerrar el despacho.
        </p>
      )}
      {receiver && d.status === "awaiting_receipt" && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            perform("receive", {
              lots: d.lots.map((l) => ({ id: l.id, kg: Number(f.get(l.id)) })),
              note: f.get("note"),
            });
          }}
        >
          <h3>Pesaje en planta</h3>
          {d.lots.map((l) => (
            <Field key={l.id} label={l.id + " · kg recibidos"}>
              <input
                name={l.id}
                type="number"
                min="0.01"
                max="50000"
                step="0.01"
                required
                defaultValue={l.verified_kg || 0}
              />
            </Field>
          ))}
          <Field
            label="Observaciones"
            hint="Explica cualquier diferencia de peso. La liquidación de acopio se conserva."
          >
            <textarea name="note" maxLength={1000} rows={3} />
          </Field>
          <button className="button primary" disabled={op.busy || !p.online}>
            Confirmar recepción y emitir certificados
          </button>
        </form>
      )}
      {d.status === "delivered" && (
        <p className="success-box">
          <CheckCircle2 size={21} />
          Despacho recibido y verificado en planta.
        </p>
      )}
      <ErrorMessage text={op.error} />
    </Modal>
  );
}
function AttendanceDialog(p: Props & { workshop: Workshop }) {
  const w = p.workshop;
  const [ids, setIds] = useState(
    w.attendance.filter((a) => a.attended).map((a) => a.user_id),
  );
  return (
    <SimpleForm
      title="Lista de asistencia"
      onClose={p.onClose}
      submitLabel="Guardar asistencia"
      onSubmit={async () => {
        await p.mutate("/workshops/" + w.id + "/attendance", "PUT", {
          attendedIds: ids,
        });
        p.flash("Asistencia guardada.");
        p.onClose();
      }}
    >
      <div className="workshop-summary">
        <h3>{w.name}</h3>
        <p>
          {date(w.starts_at, true)} · {w.location}
        </p>
        <strong>
          {ids.length} de {w.attendance.length} asistieron
        </strong>
      </div>
      <div className="check-list">
        {w.attendance.map((a) => (
          <label key={a.user_id}>
            <input
              type="checkbox"
              checked={ids.includes(a.user_id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, a.user_id]
                    : ids.filter((x) => x !== a.user_id),
                )
              }
            />
            <span>{a.name}</span>
          </label>
        ))}
      </div>
    </SimpleForm>
  );
}
function CertificateDialog({
  certificate: c,
  onClose,
}: {
  certificate: Certificate;
  onClose: () => void;
}) {
  const url = window.location.origin + "/verify/" + c.verification_code;
  return (
    <Modal title="Certificado de origen" onClose={onClose}>
      <div className="certificate-document">
        <Award size={45} />
        <span className="eyebrow">RECEPCIÓN VERIFICADA</span>
        <h2>{c.id}</h2>
        <strong className="certificate-weight">
          {number(c.snapshot.kg)} <small>kg</small>
        </strong>
        <p>{c.snapshot.material}</p>
        <QRCodeSVG value={url} size={150} marginSize={2} />
        <dl className="summary-list">
          <dt>Lote</dt>
          <dd>{c.snapshot.lot_id}</dd>
          <dt>Origen</dt>
          <dd>{c.snapshot.origin}</dd>
          <dt>Destino</dt>
          <dd>{c.snapshot.destination}</dd>
          <dt>Asociación</dt>
          <dd>{c.snapshot.association}</dd>
        </dl>
        <a className="text-button" href={url} target="_blank" rel="noreferrer">
          Verificar certificado
        </a>
        <p className="subtle">
          Acredita los registros de recepción de EcoTrace; no es una
          certificación ambiental de un tercero.
        </p>
        <a
          className="button primary full"
          href={"/api/certificates/" + c.id + "/pdf"}
        >
          <Download size={18} />
          Descargar PDF
        </a>
      </div>
    </Modal>
  );
}
function PersonDialog({
  person: p,
  onClose,
}: {
  person: TeamMember;
  onClose: () => void;
}) {
  return (
    <Modal title={p.name} subtitle={roleNames[p.role]} onClose={onClose}>
      <dl className="summary-list">
        <dt>Asociación</dt>
        <dd>{p.association || "—"}</dd>
        <dt>Última actividad</dt>
        <dd>{p.last_active ? date(p.last_active, true) : "Sin actividad"}</dd>
        <dt>Entregas registradas</dt>
        <dd>{p.deliveries}</dd>
        <dt>Celular</dt>
        <dd>{p.phone || "Sin registrar"}</dd>
      </dl>
      {p.phone && (
        <a
          className="button primary full"
          href={
            "https://wa.me/" +
            (p.phone.replace(/\D/g, "").length === 10 ? "57" : "") +
            p.phone.replace(/\D/g, "")
          }
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={19} />
          Abrir conversación en WhatsApp
        </a>
      )}
    </Modal>
  );
}
function NewUser(p: Props) {
  const [role, setRole] = useState("reciclador");
  return (
    <SimpleForm
      title="Habilitar un usuario"
      onClose={p.onClose}
      submitLabel="Crear acceso"
      onSubmit={async (f) => {
        await p.mutate("/users", "POST", {
          name: f.get("name"),
          email: f.get("email"),
          role,
          ...(role === "operario" ? { siteId: f.get("site") } : {}),
          association: f.get("association") || "",
        });
        p.flash("Usuario habilitado. Puede ingresar con su correo.");
        p.onClose();
      }}
    >
      <Field label="Nombre completo">
        <input required name="name" minLength={2} maxLength={200} />
      </Field>
      <Field label="Correo electrónico">
        <input required name="email" type="email" />
      </Field>
      <Field label="Rol">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(roleNames).map(([key, name]) => (
            <option value={key} key={key}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      {role === "operario" && (
        <Field label="Centro o planta asignada">
          <select name="site" required>
            <option value="">Seleccionar sede</option>
            {p.data.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Asociación (opcional)">
        <input name="association" maxLength={150} />
      </Field>
      <p className="info-box">
        El acceso queda limitado a tu organización y al rol asignado. La persona
        recibirá un código cuando solicite iniciar sesión.
      </p>
    </SimpleForm>
  );
}
