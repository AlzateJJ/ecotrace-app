import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
export const demoUsers = [
  {
    id: "usr-javier",
    name: "Javier Gómez",
    role: "reciclador",
    email: "javier@demo.ecotrace.co",
    site: null,
    phone: "3104567821",
  },
  {
    id: "usr-julio",
    name: "Julio Pérez",
    role: "operario",
    email: "julio@demo.ecotrace.co",
    site: "eca-esperanza",
    phone: "3042281190",
  },
  {
    id: "usr-santiago",
    name: "Santiago Ríos",
    role: "transportador",
    email: "santiago@demo.ecotrace.co",
    site: null,
    phone: "3105550182",
  },
  {
    id: "usr-isabela",
    name: "Isabela Restrepo",
    role: "empresa",
    email: "isabela@demo.ecotrace.co",
    site: null,
    phone: "3105550183",
  },
  {
    id: "usr-andres",
    name: "Andrés Mejía",
    role: "capacitador",
    email: "andres@demo.ecotrace.co",
    site: null,
    phone: "3105550184",
  },
  {
    id: "usr-planta",
    name: "Laura Vélez",
    role: "operario",
    email: "planta@demo.ecotrace.co",
    site: "planta-medellin",
    phone: "3105550185",
  },
  {
    id: "usr-admin",
    name: "Administración EcoTrace",
    role: "admin",
    email: "admin@demo.ecotrace.co",
    site: null,
    phone: "",
  },
];
export async function seedMaterials(db: DB) {
  for (const m of [
    [
      "pet-clear",
      "PET transparente",
      "Botellas limpias, sin etiquetas ni tapas",
      1200,
      1,
    ],
    [
      "pet-color",
      "PET de color",
      "Envases verdes, azules y de otros colores",
      800,
      1,
    ],
    ["bales", "PET en pacas", "Material clasificado y compactado", 1350, 1],
  ]) {
    await db.query(
      "INSERT INTO materials(id,name,description,price,points) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
      m,
    );
  }
}
export async function seedDemo(db: DB) {
  if (
    (await db.query("SELECT id FROM organizations WHERE id='org-demo'")).rows
      .length
  )
    return;
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO organizations(id,name,goal_kg) VALUES ('org-demo','Circular Valle de Aburrá',5000),('org-other','Otra organización',1000)",
    );
    for (const s of [
      [
        "eca-esperanza",
        "ECA La Esperanza",
        "center",
        "Cra. 52 # 48-20, Itagüí",
      ],
      [
        "eca-porvenir",
        "ECA El Porvenir",
        "center",
        "Cra. 43A # 38 Sur-12, Envigado",
      ],
      [
        "eca-amanecer",
        "ECA Nuevo Amanecer",
        "center",
        "Cl. 75 Sur # 43-10, Sabaneta",
      ],
      [
        "planta-medellin",
        "Planta Medellín",
        "plant",
        "Cl. 30 # 65-120, Medellín",
      ],
    ])
      await tx.query(
        "INSERT INTO sites(id,org_id,name,kind,address) VALUES($1,$2,$3,$4,$5)",
        [s[0], "org-demo", ...s.slice(1)],
      );
    for (const u of [
      ...demoUsers,
      {
        id: "usr-martha",
        name: "Martha Cárdenas",
        role: "reciclador",
        email: "martha@demo.ecotrace.co",
        site: null,
        phone: "3127784410",
      },
    ]) {
      await tx.query(
        "INSERT INTO users(id,org_id,site_id,name,email,phone,role,association,payment_account,last_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          u.id,
          "org-demo",
          u.site,
          u.name,
          u.email,
          u.phone,
          u.role,
          "Asoc. Recicladores Valle de Aburrá",
          u.role === "reciclador" ? "Nequi · " + u.phone : "",
          new Date(Date.now() - (u.id === "usr-martha" ? 12 : 1) * 86400000),
        ],
      );
    }
    await tx.query(
      "INSERT INTO users(id,org_id,name,email,role) VALUES('usr-other','org-other','Usuario externo','externo@demo.ecotrace.co','empresa')",
    );
    await seedMaterials(tx);
    const date = new Date().toISOString().slice(0, 10);
    await tx.query(
      "INSERT INTO dispatches(id,org_id,origin_id,destination_id,transporter_id,status,scheduled_date,time_window) VALUES('DSP-2026-0214','org-demo','eca-esperanza','planta-medellin','usr-santiago','prepared',$1,'06:30–07:30')",
      [date],
    );
    for (let i = 0; i < 12; i++) {
      const lotId = `LT-2026-00${487 - i}`;
      const kg = [120, 85, 72, 92, 145, 210, 110, 68, 160, 95, 125, 78][i];
      const status = i === 0 ? "declared" : i < 4 ? "received" : "delivered";
      const owner = i === 10 ? "usr-martha" : "usr-javier";
      const at = new Date(Date.now() - i * 3 * 86400000);
      await tx.query(
        "INSERT INTO lots(id,org_id,owner_id,center_id,material_id,dispatch_id,client_id,declared_kg,verified_kg,destination_kg,unit_price,points_rate,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13,$13)",
        [
          lotId,
          "org-demo",
          owner,
          i === 10 ? "eca-porvenir" : "eca-esperanza",
          i === 6 ? "pet-color" : "pet-clear",
          i === 1 || i === 2 ? "DSP-2026-0214" : null,
          randomUUID(),
          kg,
          i === 0 ? null : kg,
          status === "delivered" ? kg : null,
          i === 6 ? 800 : 1200,
          status,
          at,
        ],
      );
      await tx.query(
        "INSERT INTO lot_events(id,lot_id,actor_id,action,detail,created_at) VALUES($1,$2,$3,'registered','Entrega registrada por el reciclador',$4)",
        [randomUUID(), lotId, owner, at],
      );
      if (i > 0) {
        await tx.query(
          "INSERT INTO lot_events(id,lot_id,actor_id,action,detail,created_at) VALUES($1,$2,'usr-julio','received',$3,$4)",
          [
            randomUUID(),
            lotId,
            `${kg} kg verificados en el centro de acopio`,
            at,
          ],
        );
        await tx.query(
          "INSERT INTO payments(id,org_id,lot_id,owner_id,amount,status,reference,paid_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            randomUUID(),
            "org-demo",
            lotId,
            owner,
            kg * (i === 6 ? 800 : 1200),
            i < 4 ? "pending" : "paid",
            i < 4 ? null : `DEMO-${487 - i}`,
            i < 4 ? null : at,
            at,
          ],
        );
        await tx.query(
          "INSERT INTO point_movements(id,lot_id,user_id,points,created_at) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), lotId, owner, kg, at],
        );
      }
      if (status === "delivered") {
        await tx.query(
          "INSERT INTO lot_events(id,lot_id,actor_id,action,detail,created_at) VALUES($1,$2,'usr-planta','delivered','Recepción verificada en Planta Medellín',$3)",
          [randomUUID(), lotId, at],
        );
        await tx.query(
          "INSERT INTO certificates(id,org_id,lot_id,verification_code,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6)",
          [
            `CO-2026-0${131 - i}`,
            "org-demo",
            lotId,
            randomUUID(),
            JSON.stringify({
              lot_id: lotId,
              kg,
              material: i === 6 ? "PET de color" : "PET transparente",
              origin: i === 10 ? "ECA El Porvenir" : "ECA La Esperanza",
              destination: "Planta Medellín",
              association: "Asoc. Recicladores Valle de Aburrá",
              received_at: at.toISOString(),
            }),
            at,
          ],
        );
      }
    }
    await tx.query(
      "INSERT INTO notifications(id,user_id,title,body) VALUES($1,'usr-javier','Cada entrega deja huella','Tienes una entrega pendiente de verificación en ECA La Esperanza.')",
      [randomUUID()],
    );
    for (let i = 0; i < 2; i++) {
      const wid = `workshop-${i}`;
      await tx.query(
        "INSERT INTO workshops(id,org_id,trainer_id,name,location,starts_at,target_role) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          wid,
          "org-demo",
          "usr-andres",
          i === 0
            ? "Primeros pasos en EcoTrace"
            : "Recibir y despachar sin errores",
          i === 0 ? "ECA La Esperanza" : "ECA El Porvenir",
          new Date(Date.now() + (i + 3) * 86400000),
          i === 0 ? "reciclador" : "operario",
        ],
      );
      const users = (
        await tx.query("SELECT id FROM users WHERE org_id=$1 AND role=$2", [
          "org-demo",
          i === 0 ? "reciclador" : "operario",
        ])
      ).rows;
      for (const u of users)
        await tx.query(
          "INSERT INTO attendance(workshop_id,user_id) VALUES($1,$2)",
          [wid, u.id],
        );
    }
  });
}
