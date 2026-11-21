export type Role =
  | "reciclador"
  | "operario"
  | "transportador"
  | "empresa"
  | "capacitador"
  | "admin";
export interface User {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  site_id: string | null;
  site_kind?: "center" | "plant";
  site_name?: string;
  association: string;
  payment_account?: string;
}
export interface Material {
  id: string;
  name: string;
  description: string;
  price: number;
  points: number;
}
export interface Site {
  id: string;
  name: string;
  kind: "center" | "plant";
  address: string;
}
export interface Lot {
  id: string;
  owner_id: string;
  owner_name: string;
  material_id: string;
  material_name: string;
  center_id: string;
  center_name: string;
  declared_kg: number;
  verified_kg: number | null;
  destination_kg: number | null;
  unit_price: number;
  status: string;
  dispatch_id: string | null;
  dispatch_status: string | null;
  created_at: string;
  updated_at: string;
  events?: {
    id: string;
    action: string;
    detail: string;
    actor_name: string;
    created_at: string;
  }[];
  incidents?: { id: string; description: string; reporter_name: string }[];
}
export interface Dispatch {
  id: string;
  origin_id: string;
  origin_name: string;
  origin_address: string;
  destination_name: string;
  destination_address: string;
  destination_id: string;
  transporter_name: string;
  status: string;
  scheduled_date: string;
  time_window: string;
  lots: Lot[];
}
export interface Payment {
  id: string;
  lot_id: string;
  owner_name: string;
  amount: number;
  status: string;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
  material_name: string;
  verified_kg: number;
  unit_price: number;
}
export interface Certificate {
  id: string;
  verification_code: string;
  created_at: string;
  snapshot: {
    lot_id: string;
    kg: number;
    material: string;
    origin: string;
    destination: string;
    association: string;
    received_at: string;
  };
}
export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  phone: string;
  association: string;
  last_active: string | null;
  deliveries: number;
}
export interface Workshop {
  id: string;
  name: string;
  location: string;
  starts_at: string;
  target_role: Role;
  attendance: { user_id: string; name: string; attended: boolean }[];
}
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  site_id: string | null;
  active: boolean;
}
export interface Data {
  user: User;
  organization: { id: string; name: string; goal_kg: number };
  sites: Site[];
  materials: Material[];
  lots: Lot[];
  dispatches: Dispatch[];
  payments: Payment[];
  points: number;
  team: TeamMember[];
  workshops: Workshop[];
  certificates: Certificate[];
  users: AdminUser[];
  transporters: { id: string; name: string }[];
  notifications: {
    id: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
  }[];
}
export interface DeliveryDraft {
  clientId: string;
  materialId: string;
  centerId: string;
  declaredKg: number;
}
export const roleNames: Record<Role, string> = {
  reciclador: "Reciclador",
  operario: "Operario",
  transportador: "Transportador",
  empresa: "Empresa",
  capacitador: "Capacitador",
  admin: "Administración",
};
