export type Point = [number, number];
export type Role = "ADMIN" | "DRIVER" | "STUDENT" | "PARENT" | "SUPER_ADMIN";
export type Session = {
  token: string;
  user: {
    userId: string;
    tenantId: string | null;
    role: Role;
    name: string;
    customId: string;
    version: number;
  };
};
export type Student = {
  id: string;
  customId: string;
  tenantId: string;
  name: string;
  point: Point;
  stop: string;
  routeId: string;
  going: boolean;
  boarded: boolean;
  visit: string;
  overrideRequested: boolean;
  requestedStatus: string | null;
};
export type Driver = {
  id: string;
  customId: string;
  tenantId: string;
  name: string;
  status: string;
  reg: string;
  cnic?: string;
  license?: string;
  expiry?: string;
  reason?: string;
  photos: string[];
};
export type Trip = {
  id: string;
  tenantId: string;
  routeId: string;
  driverId: string;
  status: string;
  point: Point;
  speed: number;
  timestamp: number | null;
  simulated: boolean;
  eta: number | null;
  etaStudent: string | null;
};
export type Settings = {
  tenantId: string;
  cutoff: string;
  tripTime: string;
  campus: Point;
  fee: number;
  commission: number;
  timezone: string;
  demoOffsetMinutes: number;
};
export type Stop = {
  id: string;
  studentId: string;
  name: string;
  stop: string;
  point: Point;
  visit: string;
  boarded: boolean;
};
export type Workspace = {
  stats?: { students: number; activeTrips: number };
  tenantId: string | null;
  session: Session["user"];
  tenants: {
    id: string;
    name: string;
    type: string;
    plan: string;
    contact_email?: string;
  }[];
  students: Student[];
  drivers: Driver[];
  vehicles: { id: string; tenantId: string; reg: string; capacity: number }[];
  routes: {
    id: string;
    tenantId: string;
    name: string;
    driverId: string;
    vehicleId: string;
    startTime: string;
    direction: string;
  }[];
  trip: Trip | null;
  trips: Trip[];
  fees: {
    id: string;
    tenantId: string;
    studentId: string;
    month: string;
    amount: number;
    status: string;
    receipt: string;
    commission: number;
    net: number;
    paidAt: string | null;
  }[];
  sos: {
    type?: string;
    message?: string;
    status?: string;
    phone?: string | null;
    raised_by?: string;
    created_at?: string;
    acknowledged_name?: string | null;
    recipients?: {role:string;channel:string;status:string;count:number}[];
    id: string;
    tenantId: string;
    tripId: string;
    resolved: boolean;
    source: string;
    point: Point;
  }[];
  events: {
    id: string;
    tenantId: string;
    tripId: string;
    text: string;
    speed: number;
    type: string;
  }[];
  speedEvents: Workspace["events"];
  notifications: {
    id: string;
    tenantId: string;
    tripId: string;
    kind: string;
    text: string;
    link?: string;
    createdAt: string;
  }[];
  overrides: {
    id: string;
    tenantId: string;
    resolved: boolean;
    status: string;
  }[];
  route: { stops: Stop[]; line: Point[]; source: string };
  settings: Settings | null;
  clock: number;
  date: string;
  serverTime: number;
  demoEnabled: boolean;
};
