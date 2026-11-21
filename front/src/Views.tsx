import { useState } from "react";
import {
  Plus,
  Search,
  Download,
  Award,
  Wallet,
  Check,
  Users,
  CalendarDays,
  MapPin,
  ChevronRight,
  Building2,
  Package,
  Leaf,
} from "lucide-react";
import { type Data, roleNames } from "./types";
import type { Action } from "./App";
import { date, Empty, money, number, Status } from "./components";
import { DispatchCards, LotTable, Metric, PageHeading } from "./Dashboard";
export function WorkspaceView({
  page,
  data: d,
  action,
}: {
  page: string;
  data: Data;
  action: Action;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const u = d.user;
  const normalized = search.toLocaleLowerCase("es");
  const filters = (items: { id: string; label: string }[]) => (
    <div className="filter-chips" role="group" aria-label="Filtrar registros">
      {items.map((x) => (
        <button
          key={x.id}
          className={filter === x.id ? "active" : ""}
          onClick={() => setFilter(x.id)}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
  if (page === "lots") {
    const lots = d.lots.filter(
      (l) =>
        (filter === "all" || l.status === filter) &&
        `${l.id} ${l.material_name} ${l.center_name} ${l.owner_name}`
          .toLowerCase()
          .includes(normalized),
    );
    return (
      <>
        <PageHeading
          eyebrow="CADA ENTREGA TIENE UNA HISTORIA"
          title={
            u.role === "reciclador"
              ? "Mis entregas"
              : "Trazabilidad del material"
          }
          description="Consulta el origen, el peso y el recorrido de cada lote."
        >
          {u.role === "reciclador" ? (
            <button
              className="button primary"
              onClick={() => action("newDelivery")}
            >
              <Plus size={18} />
              Registrar entrega
            </button>
          ) : ["empresa", "admin"].includes(u.role) ? (
            <a className="button secondary" href="/api/reports/lots.csv">
              <Download size={18} />
              Exportar CSV
            </a>
          ) : u.role === "operario" && u.site_kind === "center" ? (
            <button className="button primary" onClick={() => action("scan")}>
              Recibir material
            </button>
          ) : null}
        </PageHeading>
        <section className="panel">
          <div className="list-toolbar">
            <label className="search-field">
              <Search size={19} />
              <input
                aria-label="Buscar lotes"
                placeholder="Buscar lote, material o centro…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span className="subtle">{lots.length} lotes</span>
          </div>
          {filters([
            { id: "all", label: "Todos" },
            { id: "declared", label: "Por verificar" },
            { id: "received", label: "En acopio" },
            { id: "transit", label: "En tránsito" },
            { id: "delivered", label: "Entregados" },
            { id: "rejected", label: "Rechazados" },
          ])}
          <LotTable lots={lots} onSelect={(l) => action("lot", l.id)} />
        </section>
      </>
    );
  }
  if (page === "dispatches")
    return (
      <>
        <PageHeading
          eyebrow="EL MATERIAL SIGUE SU CAMINO"
          title={
            u.role === "transportador"
              ? "Mis recogidas"
              : "Despachos y recepciones"
          }
          description="Coordina cada traslado y confirma la entrega en su destino."
        >
          {u.role === "operario" && u.site_kind === "center" && (
            <button
              className="button primary"
              onClick={() => action("newDispatch")}
            >
              <Plus size={18} />
              Crear despacho
            </button>
          )}
        </PageHeading>
        {filters([
          { id: "all", label: "Todos" },
          { id: "prepared", label: "Preparados" },
          { id: "transit", label: "En tránsito" },
          { id: "awaiting_receipt", label: "Por recibir" },
          { id: "delivered", label: "Completados" },
        ])}
        <DispatchCards
          dispatches={d.dispatches.filter(
            (x) => filter === "all" || x.status === filter,
          )}
          action={action}
        />
      </>
    );
  if (page === "payments") {
    const pending = d.payments.filter((p) => p.status === "pending");
    const paid = d.payments.filter((p) => p.status === "paid");
    return (
      <>
        <PageHeading
          eyebrow="EL VALOR DE TU APORTE"
          title={u.role === "reciclador" ? "Mis pagos" : "Liquidaciones"}
          description="Información clara sobre el valor de cada entrega verificada."
        />
        <div className="metrics three">
          <Metric
            label="Por pagar"
            value={money(pending.reduce((s, p) => s + Number(p.amount), 0))}
            detail={`${pending.length} entregas pendientes`}
            icon={Wallet}
            accent
          />
          <Metric
            label="Pagos registrados"
            value={money(paid.reduce((s, p) => s + Number(p.amount), 0))}
            detail={`${paid.length} comprobantes registrados`}
            icon={Check}
          />
          <Metric
            label={
              u.role === "reciclador"
                ? "EcoPuntos acumulados"
                : "Entregas liquidadas"
            }
            value={
              u.role === "reciclador"
                ? number(d.points)
                : String(d.payments.length)
            }
            detail={
              u.role === "reciclador"
                ? "Se acreditan al verificar tu entrega"
                : "Peso verificado × precio por kilo"
            }
            icon={Leaf}
          />
        </div>
        <section className="panel">
          <div className="panel-heading">
            <h2>Historial de liquidaciones</h2>
          </div>
          {filters([
            { id: "all", label: "Todas" },
            { id: "pending", label: "Pendientes" },
            { id: "paid", label: "Pagadas" },
          ])}
          {d.payments
            .filter((p) => filter === "all" || p.status === filter)
            .map((p) => (
              <div key={p.id} className="payment-row">
                <span className={"payment-icon " + p.status}>
                  {p.status === "paid" ? <Check /> : <Wallet />}
                </span>
                <div className="payment-info">
                  <strong>
                    {u.role === "reciclador" ? p.material_name : p.owner_name}
                  </strong>
                  <button
                    className="text-button muted"
                    onClick={() => action("lot", p.lot_id)}
                  >
                    {p.lot_id}
                  </button>
                  <small>
                    {number(p.verified_kg)} kg × {money(p.unit_price)}
                    {p.reference ? " · Ref. " + p.reference : ""}
                  </small>
                </div>
                <div className="payment-value">
                  <strong>{money(p.amount)}</strong>
                  <Status value={p.status} />
                </div>
                {u.role !== "reciclador" && p.status === "pending" && (
                  <button
                    className="button secondary"
                    onClick={() => action("payment", p)}
                  >
                    Registrar pago
                  </button>
                )}
              </div>
            ))}
          {!d.payments.length && (
            <Empty
              title="Aún no hay liquidaciones"
              text="Se generan cuando el centro verifica una entrega."
            />
          )}
          <div className="panel-note">
            Los pagos se registran con su comprobante. EcoTrace no ejecuta
            transferencias bancarias.
          </div>
        </section>
      </>
    );
  }
  if (page === "certificates")
    return (
      <>
        <PageHeading
          eyebrow="UN ORIGEN QUE PUEDES COMPROBAR"
          title="Certificados de origen"
          description="Documentos emitidos tras la recepción verificada en planta."
        />
        <div className="certificate-grid">
          {d.certificates.map((c) => (
            <article className="certificate-card" key={c.id}>
              <div className="certificate-card-top">
                <span className="certificate-icon">
                  <Award size={28} />
                </span>
                <span className="status delivered">
                  <Check size={13} />
                  Verificable
                </span>
              </div>
              <span className="eyebrow">CERTIFICADO DE ORIGEN</span>
              <h2>{c.id}</h2>
              <p>{c.snapshot.lot_id}</p>
              <strong className="certificate-weight">
                {number(c.snapshot.kg)} <small>kg de PET</small>
              </strong>
              <dl>
                <dt>Origen</dt>
                <dd>{c.snapshot.origin}</dd>
                <dt>Destino</dt>
                <dd>{c.snapshot.destination}</dd>
                <dt>Emitido</dt>
                <dd>{date(c.created_at, true)}</dd>
              </dl>
              <div className="certificate-actions">
                <button
                  className="button secondary"
                  onClick={() => action("certificate", c)}
                >
                  Ver certificado
                </button>
                <a
                  className="icon-button"
                  aria-label={"Descargar " + c.id}
                  href={"/api/certificates/" + c.id + "/pdf"}
                >
                  <Download size={20} />
                </a>
              </div>
            </article>
          ))}
        </div>
        {!d.certificates.length && (
          <Empty
            title="Tu próximo ciclo tendrá un certificado"
            text="Los documentos aparecen cuando la planta confirma la recepción."
          />
        )}
      </>
    );
  if (page === "team")
    return (
      <>
        <PageHeading
          eyebrow="UNA COMUNIDAD QUE APRENDE"
          title="Acompañamiento"
          description="Encuentra a las personas que necesitan orientación y sigue su actividad."
        />
        <section className="panel">
          <div className="list-toolbar">
            <label className="search-field">
              <Search size={19} />
              <input
                aria-label="Buscar personas"
                placeholder="Buscar por nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span className="subtle">{d.team.length} personas</span>
          </div>
          {filters([
            { id: "all", label: "Todos" },
            { id: "reciclador", label: "Recicladores" },
            { id: "operario", label: "Operarios" },
            { id: "transportador", label: "Transportadores" },
          ])}
          {d.team
            .filter(
              (p) =>
                (filter === "all" || filter === p.role) &&
                p.name.toLowerCase().includes(normalized),
            )
            .map((p) => (
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
                  <small>
                    {roleNames[p.role]} ·{" "}
                    {p.association || "Equipo de operación"}
                  </small>
                </span>
                <span className="subtle">
                  {p.last_active
                    ? "Actividad: " + date(p.last_active)
                    : "Sin actividad"}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
        </section>
      </>
    );
  if (page === "workshops")
    return (
      <>
        <PageHeading
          eyebrow="APRENDER PARA TRANSFORMAR"
          title="Talleres y encuentros"
          description="Organiza espacios de aprendizaje y registra quiénes participan."
        >
          <button
            className="button primary"
            onClick={() => action("newWorkshop")}
          >
            <Plus size={18} />
            Crear taller
          </button>
        </PageHeading>
        <div className="workshops-grid">
          {d.workshops.map((w) => (
            <article className="workshop-card" key={w.id}>
              <div className="workshop-date">
                <CalendarDays size={25} />
                <span>{date(w.starts_at, true)}</span>
              </div>
              <h2>{w.name}</h2>
              <p>
                <MapPin size={16} />
                {w.location}
              </p>
              <p>
                <Users size={16} />
                {w.attendance.length} personas inscritas ·{" "}
                {roleNames[w.target_role]}
              </p>
              <div className="attendance-preview">
                <div className="avatar-stack">
                  {w.attendance.slice(0, 4).map((a) => (
                    <span key={a.user_id} className="avatar small">
                      {a.name[0]}
                    </span>
                  ))}
                </div>
                <span>
                  {w.attendance.filter((a) => a.attended).length} asistencias
                  registradas
                </span>
              </div>
              <button
                className="button secondary full"
                onClick={() => action("attendance", w)}
              >
                Ver lista de asistencia
              </button>
            </article>
          ))}
        </div>
        {!d.workshops.length && (
          <Empty
            title="El próximo encuentro empieza aquí"
            text="Crea un taller e invita a un grupo de tu organización."
          />
        )}
      </>
    );
  if (page === "users")
    return (
      <>
        <PageHeading
          eyebrow="UNA OPERACIÓN BIEN CONECTADA"
          title="Usuarios y sedes"
          description="Habilita el acceso y vincula a cada persona con su función."
        >
          <button
            className="button secondary"
            onClick={() => action("newSite")}
          >
            <Building2 size={18} />
            Crear sede
          </button>
          <button className="button primary" onClick={() => action("newUser")}>
            <Plus size={18} />
            Crear usuario
          </button>
        </PageHeading>
        <section className="panel">
          <div className="panel-heading">
            <h2>Personas de tu organización</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {d.users.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>{p.email}</small>
                    </td>
                    <td>{roleNames[p.role]}</td>
                    <td>
                      {d.sites.find((s) => s.id === p.site_id)?.name || "—"}
                    </td>
                    <td>
                      <span
                        className={
                          "status " + (p.active ? "delivered" : "rejected")
                        }
                      >
                        {p.active ? "Activo" : "Deshabilitado"}
                      </span>
                    </td>
                    <td>
                      {p.id !== u.id && (
                        <button
                          className="text-button"
                          onClick={() => action("toggleUser", p)}
                        >
                          {p.active ? "Deshabilitar" : "Habilitar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="section-title">
          <h2>Centros y plantas</h2>
        </div>
        <div className="sites-grid">
          {d.sites.map((s) => (
            <div className="site-card" key={s.id}>
              <Building2 />
              <div>
                <strong>{s.name}</strong>
                <small>
                  {s.kind === "plant"
                    ? "Planta transformadora"
                    : "Centro de acopio"}
                </small>
                <p>{s.address}</p>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  return <Empty />;
}
