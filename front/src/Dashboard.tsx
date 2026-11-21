import {
  ArrowUpRight,
  Plus,
  Leaf,
  Package,
  Wallet,
  Scale,
  Truck,
  Check,
  ScanLine,
  Users,
  GraduationCap,
  Award,
  CalendarDays,
  MapPin,
  ChevronRight,
} from "lucide-react";
import type { Data, Lot, Dispatch } from "./types";
import type { Action } from "./App";
import { date, Empty, money, number, Status } from "./components";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Leaf;
  accent?: boolean;
}) {
  return (
    <div className={"metric " + (accent ? "accent" : "")}>
      <div>
        <span>{label}</span>
        <Icon size={21} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export function LotTable({
  lots,
  onSelect,
  compact = false,
}: {
  lots: Lot[];
  onSelect: (lot: Lot) => void;
  compact?: boolean;
}) {
  if (!lots.length)
    return (
      <Empty
        title="Este ciclo está por comenzar"
        text="Cuando registres una entrega, podrás seguir aquí su recorrido."
      />
    );
  return (
    <div className="table-wrap">
      <table className="lots-table">
        <thead>
          <tr>
            <th>Lote / Material</th>
            {!compact && <th>Centro de acopio</th>}
            <th>Peso</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id}>
              <td>
                <button className="table-primary" onClick={() => onSelect(l)}>
                  <span className="material-icon">
                    <Package size={18} />
                  </span>
                  <span>
                    <strong>{l.id}</strong>
                    <small>{l.material_name}</small>
                  </span>
                </button>
              </td>
              {!compact && (
                <td>
                  {l.center_name}
                  <small>{l.owner_name}</small>
                </td>
              )}
              <td>
                <strong>
                  {number(l.verified_kg ?? l.declared_kg)}{" "}
                  <span className="unit">kg</span>
                </strong>
              </td>
              <td>{date(l.created_at)}</td>
              <td>
                <Status value={l.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Ver " + l.id}
                  onClick={() => onSelect(l)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function DispatchCards({
  dispatches,
  action,
}: {
  dispatches: Dispatch[];
  action: Action;
}) {
  return (
    <div className="dispatch-grid">
      {dispatches.length ? (
        dispatches.map((d, i) => (
          <button
            className="dispatch-card"
            key={d.id}
            onClick={() => action("dispatch", d)}
          >
            <div className="dispatch-top">
              <span className="route-number">
                <Truck size={22} />
              </span>
              <span>
                <strong>{d.id}</strong>
                <small>
                  {date(d.scheduled_date.slice(0, 10) + "T12:00:00Z")} ·{" "}
                  {d.time_window}
                </small>
              </span>
              <Status value={d.status} />
            </div>
            <div className="route-stops">
              <div>
                <i />
                <span>
                  <small>RECOGIDA</small>
                  <strong>{d.origin_name}</strong>
                  <span>{d.origin_address}</span>
                </span>
              </div>
              <div>
                <i />
                <span>
                  <small>DESTINO</small>
                  <strong>{d.destination_name}</strong>
                  <span>{d.destination_address}</span>
                </span>
              </div>
            </div>
            <div className="dispatch-bottom">
              <span>
                {number(d.lots.reduce((s, l) => s + Number(l.verified_kg), 0))}{" "}
                kg <b>·</b> {d.lots.length} lotes
              </span>
              <span>
                Ver recorrido <ChevronRight size={16} />
              </span>
            </div>
          </button>
        ))
      ) : (
        <Empty
          title="Sin despachos por ahora"
          text="Aquí aparecerán las recogidas y entregas asignadas."
        />
      )}
    </div>
  );
}
export function Dashboard({ data: d, action }: { data: Data; action: Action }) {
  const u = d.user;
  const totalKg = d.lots
    .filter((l) => l.status !== "rejected")
    .reduce((s, l) => s + Number(l.verified_kg || 0), 0);
  const pending = d.payments
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + Number(p.amount), 0);
  const delivered = d.lots.filter((l) => l.status === "delivered");
  const title =
    u.role === "reciclador"
      ? `Hola, ${u.name.split(" ")[0]}. Cada kilo cuenta.`
      : u.role === "operario"
        ? "Todo listo para un nuevo ciclo."
        : u.role === "transportador"
          ? `Buen camino, ${u.name.split(" ")[0]}.`
          : u.role === "capacitador"
            ? "Conectar también es acompañar."
            : "El impacto de trabajar juntos.";
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("es-CO", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "America/Bogota",
        }).format(new Date())}
        title={title}
        description={
          u.role === "reciclador"
            ? "Tus entregas, tu aporte y lo que viene. Todo en un mismo lugar."
            : u.role === "capacitador"
              ? "Ayuda a que más personas sean parte de la transformación."
              : "Una mirada clara a cada paso del material y de tu operación."
        }
      >
        {u.role === "reciclador" ? (
          <button
            className="button primary"
            onClick={() => action("newDelivery")}
          >
            <Plus size={19} />
            Registrar entrega
          </button>
        ) : u.role === "operario" && u.site_kind === "center" ? (
          <>
            <button
              className="button secondary"
              onClick={() => action("newDispatch")}
            >
              <Truck size={18} />
              Crear despacho
            </button>
            <button className="button primary" onClick={() => action("scan")}>
              <ScanLine size={18} />
              Recibir material
            </button>
          </>
        ) : u.role === "capacitador" ? (
          <button
            className="button primary"
            onClick={() => action("newWorkshop")}
          >
            <Plus size={18} />
            Crear taller
          </button>
        ) : null}
      </PageHeading>
      {u.role === "reciclador" ? (
        <>
          <div className="recycler-top">
            <section className="impact-hero">
              <div>
                <span className="hero-kicker">
                  <Leaf size={15} />
                  TU APORTE DEJA HUELLA
                </span>
                <h2>
                  Material que vuelve.
                  <br />
                  Valor que se queda.
                </h2>
                <p>
                  Ya has entregado <strong>{number(totalKg)} kg de PET</strong>.
                  <br />
                  Gracias por darle una nueva oportunidad.
                </p>
                <button
                  onClick={() => action("navigate", "lots")}
                  className="hero-link"
                >
                  Ver mis entregas <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="hero-illustration" aria-hidden="true">
                <div className="hero-ring ring-a" />
                <div className="hero-ring ring-b" />
                <div className="bottle mini">
                  <div className="bottle-cap" />
                  <div className="bottle-neck" />
                  <div className="bottle-body">
                    <Leaf size={39} />
                  </div>
                </div>
                <span className="floating-leaf">
                  <Leaf size={27} />
                </span>
                <span className="floating-check">
                  <Check size={20} />
                </span>
                <span className="orbit-label">VOLVER A EMPEZAR</span>
              </div>
            </section>
            <section className="payout-card">
              <div>
                <span className="payout-icon">
                  <Wallet size={22} />
                </span>
                <span className="eyebrow">POR RECIBIR</span>
              </div>
              <strong>{money(pending)}</strong>
              <p>
                {d.payments.filter((p) => p.status === "pending").length}{" "}
                entregas verificadas pendientes de pago
              </p>
              <button
                className="button secondary full"
                onClick={() => action("navigate", "payments")}
              >
                Consultar mis pagos <ChevronRight size={17} />
              </button>
              <small>El pago se confirma con un comprobante.</small>
            </section>
          </div>
          <div className="metrics three">
            <Metric
              label="PET entregado"
              value={`${number(totalKg)} kg`}
              detail={`${d.lots.filter((l) => l.verified_kg).length} entregas verificadas`}
              icon={Scale}
            />
            <Metric
              label="Tus EcoPuntos"
              value={number(d.points)}
              detail="Cada entrega suma a tu aporte"
              icon={Leaf}
              accent
            />
            <Metric
              label="Ciclos completados"
              value={String(delivered.length).padStart(2, "0")}
              detail="Lotes recibidos en planta"
              icon={Check}
            />
          </div>
          <div className="dashboard-columns">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Tus últimas entregas</h2>
                  <p>Sigue el recorrido de tu material.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => action("navigate", "lots")}
                >
                  Ver todas <ChevronRight size={16} />
                </button>
              </div>
              <LotTable
                lots={d.lots.slice(0, 5)}
                compact
                onSelect={(l) => action("lot", l.id)}
              />
            </section>
            <section className="journey-card">
              <span className="eyebrow">ASÍ CERRAMOS EL CICLO</span>
              <h2>
                Tu PET tiene
                <br />
                un camino.
              </h2>
              <div className="journey-steps">
                <div>
                  <span>
                    <Package size={19} />
                  </span>
                  <div>
                    <strong>Registra tu entrega</strong>
                    <p>Elige el material y el centro.</p>
                  </div>
                </div>
                <div>
                  <span>
                    <Scale size={19} />
                  </span>
                  <div>
                    <strong>Confirmamos el peso</strong>
                    <p>El operario verifica tu aporte.</p>
                  </div>
                </div>
                <div>
                  <span>
                    <Truck size={19} />
                  </span>
                  <div>
                    <strong>Le damos otro destino</strong>
                    <p>Tu lote llega a la planta.</p>
                  </div>
                </div>
              </div>
              <div className="journey-bottom">
                <Leaf size={16} />
                Un proceso claro, de principio a fin.
              </div>
            </section>
          </div>
        </>
      ) : u.role === "transportador" ? (
        <>
          <div className="metrics three">
            <Metric
              label="Recogidas preparadas"
              value={String(
                d.dispatches.filter((x) => x.status === "prepared").length,
              )}
              detail="Consulta los horarios de cargue"
              icon={Package}
            />
            <Metric
              label="En camino"
              value={String(
                d.dispatches.filter((x) => x.status === "transit").length,
              )}
              detail="Despachos bajo tu custodia"
              icon={Truck}
              accent
            />
            <Metric
              label="Entregas completadas"
              value={String(
                d.dispatches.filter((x) => x.status === "delivered").length,
              )}
              detail="Confirmadas por la planta"
              icon={Check}
            />
          </div>
          <div className="section-title">
            <h2>Tus próximas paradas</h2>
            <span className="subtle">Ruta y material asignados</span>
          </div>
          <DispatchCards
            dispatches={d.dispatches.filter((x) => x.status !== "delivered")}
            action={action}
          />
        </>
      ) : u.role === "operario" ? (
        <>
          <div className="metrics three">
            <Metric
              label="Por verificar"
              value={String(
                u.site_kind === "plant"
                  ? d.dispatches.filter((x) => x.status === "awaiting_receipt")
                      .length
                  : d.lots.filter((l) => l.status === "declared").length,
              )}
              detail={
                u.site_kind === "plant"
                  ? "Despachos esperando recepción"
                  : "Entregas esperando pesaje"
              }
              icon={ScanLine}
            />
            <Metric
              label="Material en acopio"
              value={`${number(d.lots.filter((l) => l.status === "received").reduce((s, l) => s + Number(l.verified_kg), 0))} kg`}
              detail="Peso verificado disponible"
              icon={Scale}
              accent
            />
            <Metric
              label="Despachos activos"
              value={String(
                d.dispatches.filter((x) => x.status !== "delivered").length,
              )}
              detail="Preparados, en tránsito o por recibir"
              icon={Truck}
            />
          </div>
          {u.site_kind === "plant" ? (
            <>
              <div className="section-title">
                <h2>Recepciones de la planta</h2>
              </div>
              <DispatchCards
                dispatches={d.dispatches.filter(
                  (x) => x.status !== "delivered",
                )}
                action={action}
              />
            </>
          ) : (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Material por recibir</h2>
                  <p>Verifica el peso y la calidad de cada entrega.</p>
                </div>
              </div>
              <LotTable
                lots={d.lots.filter((l) => l.status === "declared")}
                onSelect={(l) => action("lot", l.id)}
              />
            </section>
          )}
          <section className="panel margin-top">
            <div className="panel-heading">
              <h2>Últimos movimientos</h2>
              <button
                className="text-button"
                onClick={() => action("navigate", "lots")}
              >
                Ver inventario <ChevronRight size={16} />
              </button>
            </div>
            <LotTable
              lots={d.lots.slice(0, 5)}
              onSelect={(l) => action("lot", l.id)}
            />
          </section>
        </>
      ) : u.role === "capacitador" ? (
        <TrainerDashboard data={d} action={action} />
      ) : (
        <>
          <div className="metrics four">
            <Metric
              label="PET recuperado"
              value={`${number(delivered.reduce((s, l) => s + Number(l.destination_kg), 0))} kg`}
              detail="Recepción verificada en planta"
              icon={Scale}
              accent
            />
            <Metric
              label="Lotes trazados"
              value={String(d.lots.length)}
              detail="Desde el origen hasta su destino"
              icon={Package}
            />
            <Metric
              label="Certificados emitidos"
              value={String(d.certificates.length)}
              detail="Con código de verificación"
              icon={Award}
            />
            <Metric
              label="Por liquidar"
              value={money(pending)}
              detail="Entregas verificadas sin pago registrado"
              icon={Wallet}
            />
          </div>
          <div className="dashboard-columns">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Un impacto que crece</h2>
                  <p>Kg recibidos en planta · últimos seis meses</p>
                </div>
                <span className="chart-legend">
                  <i />
                  PET recuperado
                </span>
              </div>
              <ActivityChart lots={delivered} />
            </section>
            <section className="goal-card">
              <span className="eyebrow">META DE RECUPERACIÓN</span>
              <h2>
                Cada aporte
                <br />
                nos acerca.
              </h2>
              <strong>
                {Math.round(
                  (delivered.reduce((s, l) => s + Number(l.destination_kg), 0) /
                    Number(d.organization.goal_kg)) *
                    100,
                )}
                <small>%</small>
              </strong>
              <div className="progress">
                <span
                  style={{
                    width:
                      Math.min(
                        100,
                        (delivered.reduce(
                          (s, l) => s + Number(l.destination_kg),
                          0,
                        ) /
                          Number(d.organization.goal_kg)) *
                          100,
                      ) + "%",
                  }}
                />
              </div>
              <p>
                {number(
                  delivered.reduce((s, l) => s + Number(l.destination_kg), 0),
                )}{" "}
                de {number(d.organization.goal_kg)} kg
              </p>
              <button className="text-button" onClick={() => action("goal")}>
                Ajustar meta
              </button>
            </section>
          </div>
          <section className="panel margin-top">
            <div className="panel-heading">
              <div>
                <h2>Trazabilidad reciente</h2>
                <p>Personas, material y movimientos conectados.</p>
              </div>
              <button
                className="text-button"
                onClick={() => action("navigate", "lots")}
              >
                Explorar lotes <ChevronRight size={16} />
              </button>
            </div>
            <LotTable
              lots={d.lots.slice(0, 5)}
              onSelect={(l) => action("lot", l.id)}
            />
          </section>
        </>
      )}
    </>
  );
}
function ActivityChart({ lots }: { lots: Lot[] }) {
  const now = new Date();
  const series = Array.from({ length: 6 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      label: month.toLocaleDateString("es-CO", { month: "short" }),
      value: lots
        .filter((l) => {
          const date = new Date(l.updated_at);
          return (
            date.getMonth() === month.getMonth() &&
            date.getFullYear() === month.getFullYear()
          );
        })
        .reduce((s, l) => s + Number(l.destination_kg), 0),
    };
  });
  const max = Math.max(...series.map((x) => x.value), 1);
  return (
    <div
      className="bar-chart"
      role="img"
      aria-label={series.map((x) => `${x.label}: ${x.value} kg`).join(", ")}
    >
      {series.map((x, i) => (
        <div className="bar-column" key={i}>
          <div className="bar-space">
            <span className="bar-value">{number(x.value)}</span>
            <div
              className={"bar " + (i === 5 ? "current" : "")}
              style={{
                height: Math.max(x.value ? 5 : 1, (x.value / max) * 150),
              }}
            />
          </div>
          <span>{x.label}</span>
        </div>
      ))}
    </div>
  );
}
function TrainerDashboard({ data: d, action }: { data: Data; action: Action }) {
  const active = d.team.filter(
    (u) =>
      u.last_active &&
      Date.now() - new Date(u.last_active).getTime() < 7 * 86400000,
  );
  const inactive = d.team.filter((u) => !active.includes(u));
  return (
    <>
      <div className="metrics three">
        <Metric
          label="Actividad reciente"
          value={`${d.team.length ? Math.round((active.length / d.team.length) * 100) : 0}%`}
          detail="Usuarios con operaciones en los últimos 7 días"
          icon={Users}
          accent
        />
        <Metric
          label="Para acompañar"
          value={String(inactive.length)}
          detail="Sin actividad reciente"
          icon={Leaf}
        />
        <Metric
          label="Talleres programados"
          value={String(
            d.workshops.filter((w) => new Date(w.starts_at) > new Date())
              .length,
          )}
          detail="Espacios para aprender juntos"
          icon={GraduationCap}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Un pequeño contacto, un gran cambio</h2>
              <p>Personas que podrían necesitar tu ayuda.</p>
            </div>
          </div>
          {inactive.length ? (
            inactive.map((p) => (
              <button
                className="person-row"
                key={p.id}
                onClick={() => action("person", p)}
              >
                <span className="avatar">
                  {p.name
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.association || "Equipo de operación"}</small>
                </span>
                <span className="status pending">
                  {p.last_active
                    ? Math.floor(
                        (Date.now() - new Date(p.last_active).getTime()) /
                          86400000,
                      ) + " días"
                    : "Sin actividad"}
                </span>
                <ChevronRight size={18} />
              </button>
            ))
          ) : (
            <Empty
              title="Tu comunidad está activa"
              text="Puedes consultar a todos los usuarios desde Acompañamiento."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Próximos talleres</h2>
            <button
              className="text-button"
              onClick={() => action("navigate", "workshops")}
            >
              Ver todos
            </button>
          </div>
          {d.workshops.slice(0, 3).map((w) => (
            <button
              key={w.id}
              className="workshop-mini"
              onClick={() => action("attendance", w)}
            >
              <span className="calendar-icon">
                <CalendarDays />
              </span>
              <span>
                <strong>{w.name}</strong>
                <small>
                  {date(w.starts_at)} · {w.location}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
      </div>
    </>
  );
}
