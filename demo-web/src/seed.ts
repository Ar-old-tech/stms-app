export type Point = [number, number];
export const tenantId = "sunrise";
export const campus: Point = [33.6426, 72.993];
export const depot: Point = [33.5973, 73.0479];
export const places = [
  "Committee Chowk",
  "Satellite Town",
  "Faizabad",
  "I-8 Markaz",
  "Chandni Chowk",
  "G-9 Markaz",
  "F-10 Markaz",
  "H-8",
  "Campus",
  "Depot",
].map((name, i) => ({
  name,
  point: (
    [
      [33.603, 73.068],
      [33.636, 73.065],
      [33.659, 73.081],
      [33.6683, 73.0759],
      [33.614, 73.072],
      [33.6951, 73.039],
      [33.694, 73.012],
      [33.661, 73.056],
      campus,
      depot,
    ] as Point[]
  )[i],
}));
export function seed() {
  return {
    users: [
      {
        id: "SUP-01",
        tenantId: "platform",
        role: "Super Admin",
        name: "Platform owner",
      },
      {
        id: "SCH-01-ADM",
        tenantId,
        role: "Admin",
        name: "Sunrise administrator",
      },
      { id: "DRV-4821", tenantId, role: "Driver", name: "Imran Khan" },
      { id: "STU-2026-44", tenantId, role: "Parent", name: "Ayesha Khan" },
    ],
    tenants: [
      {
        id: tenantId,
        tenantId,
        name: "Sunrise Coaching Center",
        type: "COACHING",
        plan: "Driver Pro",
      },
      {
        id: "city",
        tenantId: "city",
        name: "City College",
        type: "COLLEGE",
        plan: "Institute",
      },
    ],
    students: [
      "Ayesha Khan",
      "Hassan Ali",
      "Fatima Ahmed",
      "Omar Farooq",
      "Zainab Malik",
      "Ali Raza",
      "Maryam Shah",
      "Ibrahim Noor",
    ].map((name, i) => ({
      id: i === 0 ? "STU-2026-44" : `STU-2026-${50 + i}`,
      tenantId,
      name,
      point: places[i].point,
      stop: places[i].name,
      going: true,
      boarded: false,
      visit: "Waiting",
    })),
    drivers: [
      {
        id: "DRV-4821",
        tenantId,
        name: "Imran Khan",
        status: "VERIFIED",
        reg: "ICT-1182",
        cnic: "DEMO-IDENTITY-01",
        license: "DEMO-LIC-01",
        expiry: "2027-10-01",
        reason: "",
        photos: [] as string[],
      },
      {
        id: "application-2",
        tenantId,
        name: "Usman Ahmed",
        status: "PENDING",
        reg: "RWP-2094",
        cnic: "DEMO-IDENTITY-02",
        license: "DEMO-LIC-02",
        expiry: "2026-11-10",
        reason: "",
        photos: [] as string[],
      },
      {
        id: "application-3",
        tenantId,
        name: "Bilal Shah",
        status: "PENDING",
        reg: "ICT-7720",
        cnic: "DEMO-IDENTITY-03",
        license: "DEMO-LIC-03",
        expiry: "2027-09-01",
        reason: "",
        photos: [] as string[],
      },
    ],
    vehicles: [{ id: "v1", tenantId, reg: "ICT-1182", capacity: 12 }],
    routes: [
      {
        id: "r1",
        tenantId,
        name: "Twin Cities • Morning",
        driverId: "DRV-4821",
        vehicleId: "v1",
      },
    ],
    fees: Array.from({ length: 8 }, (_, i) => ({
      id: `fee-${i}`,
      tenantId,
      studentId: i === 0 ? "STU-2026-44" : `STU-2026-${50 + i}`,
      amount: 6500,
      status: i === 0 ? "PENDING" : i % 3 === 0 ? "FAILED" : "PAID",
      receipt: i === 0 ? "" : `STMS-26010${i}`,
      commission: 325,
      net: 6175,
    })),
    clock: 5 * 3600 + 45 * 60,
    speed: 1,
    muted: true,
    attendanceVersion: 0,
    settings: {
      tenantId,
      cutoff: "06:00",
      tripTime: "06:15",
      fee: 6500,
      commission: 5,
      campus,
    },
    trip: {
      id: "trip-1",
      tenantId,
      status: "IDLE",
      point: depot,
      speed: 0,
      next: 0,
      paused: false,
      driverId: "DRV-4821",
    },
    notifications: [] as {
      id: string;
      tenantId: string;
      role: string;
      text: string;
      studentId?: string;
      link?: string;
    }[],
    sos: [
      {
        id: "past-sos",
        tenantId,
        resolved: true,
        source: "Driver",
        point: depot,
      },
    ],
    events: [
      { id: "past-event", tenantId, text: "Previous trip completed safely" },
    ],
    speedEvents: [{ id: "past-speed", tenantId, speed: 64 }],
    alerted: [] as string[],
    overrides: [] as { id: string; tenantId: string; resolved: boolean }[],
  };
}
export type DemoData = ReturnType<typeof seed>;
