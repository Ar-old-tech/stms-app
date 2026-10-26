# Smart Transport Management System (STMS)

## 📌 Project Overview & Problem Statement
The **Smart Transport Management System (STMS)** is a multi-tenant web application engineered to solve school transport logistics, driver accountability, and student safety challenges. 

Educational institutions often struggle with manual routing, unmonitored bus locations, lack of parental visibility, and delayed emergency responses. STMS replaces these legacy challenges with real-time GPS fleet tracking, automated route and ETA optimization, transparent fee management, and instant emergency (SOS) alerts for parents and school administrators.

---

## ✨ Main Features
* **Real-time Vehicle Tracking**: Live telemetry streamed over Socket.IO and rendered dynamically on Leaflet/OpenStreetMap maps.
* **Role-Based Portals**:
  * **Platform / School Admin**: Driver onboarding, document verification, route scheduling, fee generation, and emergency resolution.
  * **Driver**: Phone GPS broadcasting, trip lifecycle management, passenger tracking, and SOS dispatch.
  * **Parent / Student**: Attendance declarations, live trip tracking, route notifications, and secure sandbox fee processing.
* **Emergency SOS System**: Instant multi-channel emergency alerts (In-App inbox, optional SMS/WhatsApp via Twilio).
* **Automated Route Optimization**: OSRM (Open Source Routing Machine) integration for intelligent waypoint ordering, proximity detection, and automated speed alerts.
* **Security & Privacy**: AES-256-GCM encryption for sensitive documents/CNICs, bcrypt password hashing, and strict PostgreSQL Row-Level Security (RLS).

---

## 🛠️ Stack & Third-Party Acknowledgments
This project leverages modern, production-grade technologies and open-source resources:
* **Frontend**: React, Vite, Tailwind CSS, Leaflet 1.9.4.
* **Backend**: Node.js, TypeScript, Express 5, Socket.IO 4, Zod, node-postgres.
* **Database & Infrastructure**: PostgreSQL with PostGIS extension (hosted via Supabase / Neon).
* **External APIs & Services**: OpenStreetMap (OSM) tile providers, OSRM routing engine, Twilio messaging API.

---

## 🚀 How to Run & Test (Local Setup)

### Prerequisites
* Node.js version **`24.21.0`** (or `>=22.12`)
* A PostgreSQL database instance with PostGIS enabled

### Installation & Build
From the repository root, install dependencies and build both packages:
```bash
npm run setup
npm run build
