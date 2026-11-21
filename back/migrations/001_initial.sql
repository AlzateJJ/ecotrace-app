CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL, goal_kg numeric(14,2) NOT NULL DEFAULT 50000 CHECK (goal_kg > 0));
CREATE TABLE sites (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('center','plant')), address text NOT NULL, UNIQUE(id,org_id));
CREATE TABLE users (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), site_id text,
 name text NOT NULL, email text NOT NULL UNIQUE, phone text NOT NULL DEFAULT '', association text NOT NULL DEFAULT '', payment_account text NOT NULL DEFAULT '',
 role text NOT NULL CHECK(role IN ('reciclador','operario','transportador','empresa','capacitador','admin')),
 active boolean NOT NULL DEFAULT true, last_active timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(site_id,org_id) REFERENCES sites(id,org_id), UNIQUE(id,org_id)
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL);
CREATE TABLE login_codes (id text PRIMARY KEY, email text NOT NULL, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false);
CREATE INDEX login_codes_email ON login_codes(email,expires_at);
CREATE TABLE materials (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL, price integer NOT NULL CHECK(price > 0), points numeric NOT NULL DEFAULT 1 CHECK(points >= 0));
CREATE TABLE dispatches (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), origin_id text NOT NULL, destination_id text NOT NULL, transporter_id text NOT NULL,
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','transit','awaiting_receipt','delivered')),
 scheduled_date date NOT NULL, time_window text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(origin_id,org_id) REFERENCES sites(id,org_id), FOREIGN KEY(destination_id,org_id) REFERENCES sites(id,org_id), FOREIGN KEY(transporter_id,org_id) REFERENCES users(id,org_id), UNIQUE(id,org_id)
);
CREATE TABLE lots (
 id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL, center_id text NOT NULL, material_id text NOT NULL REFERENCES materials(id), dispatch_id text,
 client_id text NOT NULL, declared_kg numeric(12,2) NOT NULL CHECK(declared_kg > 0), verified_kg numeric(12,2) CHECK(verified_kg > 0), destination_kg numeric(12,2) CHECK(destination_kg >= 0),
 unit_price integer NOT NULL CHECK(unit_price > 0), points_rate numeric NOT NULL CHECK(points_rate >= 0),
 status text NOT NULL DEFAULT 'declared' CHECK(status IN ('declared','received','rejected','transit','delivered')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_id), FOREIGN KEY(owner_id,org_id) REFERENCES users(id,org_id), FOREIGN KEY(center_id,org_id) REFERENCES sites(id,org_id), FOREIGN KEY(dispatch_id,org_id) REFERENCES dispatches(id,org_id), UNIQUE(id,org_id)
);
CREATE INDEX lots_org_status ON lots(org_id,status);
CREATE INDEX lots_owner ON lots(owner_id);
CREATE TABLE lot_events (id text PRIMARY KEY, lot_id text NOT NULL REFERENCES lots(id), actor_id text NOT NULL REFERENCES users(id), action text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payments (id text PRIMARY KEY, org_id text NOT NULL, lot_id text NOT NULL UNIQUE, owner_id text NOT NULL, amount integer NOT NULL CHECK(amount >= 0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')), reference text, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(lot_id,org_id) REFERENCES lots(id,org_id), FOREIGN KEY(owner_id,org_id) REFERENCES users(id,org_id));
CREATE TABLE point_movements (id text PRIMARY KEY, lot_id text NOT NULL UNIQUE REFERENCES lots(id), user_id text NOT NULL REFERENCES users(id), points integer NOT NULL CHECK(points >= 0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE certificates (id text PRIMARY KEY, org_id text NOT NULL, lot_id text NOT NULL UNIQUE, verification_code text NOT NULL UNIQUE, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(lot_id,org_id) REFERENCES lots(id,org_id));
CREATE TABLE notifications (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE workshops (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), trainer_id text NOT NULL, name text NOT NULL, location text NOT NULL, starts_at timestamptz NOT NULL, target_role text NOT NULL CHECK(target_role IN ('reciclador','operario','transportador')), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(trainer_id,org_id) REFERENCES users(id,org_id), UNIQUE(id,org_id));
CREATE TABLE attendance (workshop_id text NOT NULL REFERENCES workshops(id), user_id text NOT NULL REFERENCES users(id), attended boolean NOT NULL DEFAULT false, PRIMARY KEY(workshop_id,user_id));
CREATE TABLE incidents (id text PRIMARY KEY, org_id text NOT NULL, lot_id text NOT NULL, reporter_id text NOT NULL, description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(lot_id,org_id) REFERENCES lots(id,org_id), FOREIGN KEY(reporter_id,org_id) REFERENCES users(id,org_id));
CREATE TABLE audit_log (id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES users(id), action text NOT NULL, resource_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
