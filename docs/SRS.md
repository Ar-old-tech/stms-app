**Smart Transport Management System**

**(S.T.M.S.)**

Project Documentation, Technical Blueprint and Business Plan

*A multi-tenant platform for school, college, university and coaching-center transport*

Version 1.0 \| Status: Draft for development \| 24 September 2026

Document Control

| **Item**         | **Detail**                                                                                                                                                                              |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Document title   | S.T.M.S. - Project Documentation, Technical Blueprint and Business Plan                                                                                                                 |
| Version / status | 1.0 / Draft for development                                                                                                                                                             |
| Date             | 24 September 2026                                                                                                                                                                       |
| Purpose          | To define the scope, requirements, architecture, data model, workflows, business model and delivery plan of S.T.M.S. so that development can begin.                                     |
| Source           | Consolidated from the initial planning discussion, with technical corrections, missing components and a business model added.                                                           |
| Important note   | Market claims, prices and revenue figures in this document are planning assumptions and have not been independently verified. They must be validated with real users before commitment. |

1\. Executive Summary

The Smart Transport Management System (S.T.M.S.) is a multi-tenant mobile and web platform that manages daily student transport for schools, colleges, universities and coaching centers. It replaces manual coordination, typically conducted through telephone calls and messaging groups, with a structured digital process in which students or parents declare daily attendance, drivers receive an automatically optimized route, and parents follow the vehicle in real time.

The system is designed around three user roles: the Administrator of each institution, the Driver, and the Parent or Student. Its distinguishing capabilities are (a) dynamic stop skipping, whereby a student who marks themselves as not travelling is removed from the driver's route for that day and the remaining stops are re-ordered; (b) an administrator-controlled driver verification process covering national identity, driving license and vehicle registration; (c) advance notification to parents approximately five minutes before the vehicle arrives; (d) an emergency alert facility; and (e) a software-only design that uses the driver's smartphone as the location device, removing the need for dedicated GPS hardware.

The proposed implementation uses Java 21 with Spring Boot 3 for the backend, PostgreSQL with PostGIS and Redis for data, Flutter for the mobile applications, React for the administration portal, and free open-source geospatial services (OpenStreetMap, OSRM and Nominatim) to avoid licensing costs. The business model is subscription-led, targeting independent van operators and coaching centers first, and expanding to institutions and larger fleets after a pilot has demonstrated reliability.

This document sets out the requirements, architecture, data model, workflows, interface specifications, security considerations, business model, delivery roadmap, testing strategy and open decisions required to begin implementation.

2\. Introduction

2.1 Problem Statement

Many private vans, college shuttles and coaching-center transport services still rely on manual communication to confirm which students will travel on a given day. This causes wasted fuel and time when vehicles stop for absent students, provides parents with little visibility of the vehicle's location, and offers institutions no reliable record of who was transported. Trust in independent drivers is difficult to establish because credentials are rarely verified in a way that parents can see. Existing solutions often depend on purchased GPS hardware or address only primary and secondary schools.

2.2 Objectives

- Enable daily Going / Not Going declarations that directly change the driver's route and record attendance.

- Reduce unnecessary stops, travel time and fuel use through automatic route re-optimization.

- Provide parents with live tracking, estimated time of arrival and timely notifications.

- Establish trust through administrator-verified driver and vehicle records visible to parents.

- Support multiple institution types within a single multi-tenant platform.

- Keep operating costs low by using smartphones and free open-source mapping services.

- Support online fee recording and payment with digital receipts.

2.3 Scope

| **In scope for the Minimum Viable Product**                                                                                                                                                                                                                                                                       | **Deferred to later releases**                                                                                                                                                                                                    |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Three roles: Administrator, Driver, Parent/Student; tenant onboarding; vehicles and routes; driver document verification; student stop selection; daily attendance with cut-off time; dynamic routing; live tracking and ETA; proximity notification; speed monitoring; emergency alert; fee ledger and receipts. | RFID or QR boarding confirmation; SMS and WhatsApp notifications; analytics dashboards and reports; route history replay; offline mode; advanced multi-child family management; automated payouts to drivers; iOS release polish. |

2.4 Definitions

| **Term**     | **Meaning**                                                                                                                 |
|--------------|-----------------------------------------------------------------------------------------------------------------------------|
| Tenant       | An institution (school, college, university or coaching center) using the platform with its own users, routes and settings. |
| Stop         | The location selected by a student or parent where the vehicle will pick up or drop off the student.                        |
| Cut-off time | The time after which a student may no longer change the Going / Not Going status for the trip.                              |
| OSRM         | Open Source Routing Machine, a routing engine that calculates routes and optimized visiting order.                          |
| PostGIS      | A spatial extension for PostgreSQL that stores and queries geographic data.                                                 |
| FCM          | Firebase Cloud Messaging, a free service for delivering push notifications to mobile devices.                               |
| Geofence     | A virtual boundary around a location that triggers an event when entered or exited.                                         |

3\. Market Context and Positioning

The planning discussion identified several existing products, including local applications such as RouteCabin and SmartVan, hardware-based tracking services, and transport modules within school management software such as EduSuite. These generally emphasize live location display for schools, and some depend on purchased tracking devices priced in the range of PKR 8,000 to 15,000 per vehicle.

The following table summarizes the intended positioning of S.T.M.S. relative to the typical offering described in that discussion.

| **Area**            | **Typical existing offering**         | **S.T.M.S. approach**                                                               |
|---------------------|---------------------------------------|-------------------------------------------------------------------------------------|
| Target institutions | Mostly schools                        | Schools, colleges, universities and coaching centers in one multi-tenant platform   |
| Route handling      | Fixed routes regardless of attendance | Dynamic stop skipping and route re-ordering per day                                 |
| Driver trust        | Manual or off-platform checks         | In-app verification of identity, license and vehicle with a visible Verified status |
| Attendance          | Driver marks boarding after arrival   | Pre-trip intent from the student changes the route in advance                       |
| Hardware            | Dedicated GPS device in many cases    | Driver smartphone only                                                              |

*Note: statements regarding the number of competing products and the proportion of drivers who use messaging groups originated from an AI-assisted research session and have not been independently verified. A short competitor and user-interview study should be completed before final pricing and positioning decisions are made.*

4\. Stakeholders and User Roles

| **Role**                             | **Login identifier format**          | **Principal responsibilities and permissions**                                                                                       |
|--------------------------------------|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Super Administrator (platform owner) | SUP-01                               | Creates and manages tenants; views platform-wide data; manages subscriptions.                                                        |
| Tenant Administrator                 | SCH-01-ADM                           | Reviews and approves drivers; manages students, routes and vehicles; monitors live fleet; manages fees and reports.                  |
| Driver                               | DRV-XXXX (issued after verification) | Starts and ends trips; follows the optimized route; records arrival and pickup; sends emergency alerts.                              |
| Parent / Student                     | STU-2026-44                          | Sets the pick-up location; declares daily attendance; tracks the vehicle; receives notifications; pays fees; sends emergency alerts. |

5\. Functional Requirements

5.1 Authentication and Identification

| **ID** | **Requirement**                                                                                                                                                |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-A1  | The system shall authenticate users by a custom login identifier and password and issue a signed token containing user identifier, tenant identifier and role. |
| FR-A2  | The system shall generate unique identifiers automatically. Identifiers shall include a non-sequential component so that they cannot be readily guessed.       |
| FR-A3  | After login the application shall present the interface appropriate to the role: driver map, student screen or administration dashboard.                       |
| FR-A4  | The system shall provide password reset through an administrator or one-time code.                                                                             |

5.2 Tenant and Administration

| **ID** | **Requirement**                                                                                                  |
|--------|------------------------------------------------------------------------------------------------------------------|
| FR-T1  | The system shall allow creation of a tenant classified as school, college, university or coaching center.        |
| FR-T2  | Each tenant shall be able to configure the attendance cut-off time, trip times, campus location and fee amounts. |
| FR-T3  | Administrators shall manage vehicles, routes and driver assignment.                                              |
| FR-T4  | Administrators shall be able to import students in bulk from a spreadsheet file and issue identifiers.           |
| FR-T5  | Administrators shall view a live map of all vehicles on active trips.                                            |

5.3 Driver Verification

| **ID** | **Requirement**                                                                                                                                     |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| FR-D1  | A driver shall submit national identity number, driving license number, vehicle registration number and photographs of the corresponding documents. |
| FR-D2  | The account shall remain in Pending status until an administrator approves or rejects the submission; a rejection shall record a reason.            |
| FR-D3  | On approval the system shall set the status to Verified, issue the driver identifier and display a Verified badge with vehicle number to parents.   |
| FR-D4  | The system shall record the license expiry date and remind the administrator before expiry.                                                         |

5.4 Student and Parent Functions

| **ID** | **Requirement**                                                                                                                |
|--------|--------------------------------------------------------------------------------------------------------------------------------|
| FR-S1  | The user shall select the stop location on a map, using address search or by placing a pin.                                    |
| FR-S2  | The user shall mark each trip as Going or Not Going until the cut-off time. The default status shall be Going.                 |
| FR-S3  | Marking Not Going shall record the student as absent for that trip and remove the stop from the driver's route for that day.   |
| FR-S4  | The user shall see the live vehicle position, estimated time of arrival and trip status, including arrival at the institution. |
| FR-S5  | The system shall notify the parent when the estimated arrival at the student's stop is approximately five minutes.             |
| FR-S6  | The user shall view fee status, make payment and download receipts.                                                            |

5.5 Driver Application

| **ID** | **Requirement**                                                                                                         |
|--------|-------------------------------------------------------------------------------------------------------------------------|
| FR-V1  | The driver shall start a trip, which activates continuous location reporting through a foreground service.              |
| FR-V2  | The map shall show only students marked Going, in optimized order, with the route drawn for navigation.                 |
| FR-V3  | The driver shall record Arrived, Picked up and No-show for each stop and Dropped at institution at the end of the trip. |
| FR-V4  | The driver shall be notified when a student changes status.                                                             |
| FR-V5  | The current speed shall be displayed; over-speed events shall be logged and reported to the administrator.              |
| FR-V6  | The driver shall be able to send an emergency alert.                                                                    |

5.6 Safety and Fees

| **ID** | **Requirement**                                                                                                                  |
|--------|----------------------------------------------------------------------------------------------------------------------------------|
| FR-X1  | An emergency alert shall notify the tenant administrator and all parents assigned to the trip, with a link to the live location. |
| FR-X2  | Entry of the vehicle into the campus geofence shall mark the trip as arrived.                                                    |
| FR-F1  | The system shall maintain monthly fee records with status Pending, Paid or Failed.                                               |
| FR-F2  | On successful payment the system shall generate a digital receipt and notify the parent.                                         |
| FR-F3  | The ledger shall support an optional platform commission and calculated driver net amount.                                       |

6\. Non-Functional Requirements

| **Category**     | **Requirement**                                                                                                                                                                  |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Performance      | Location updates should reach parent screens within a few seconds; route recalculation after an attendance change should complete within a few seconds under normal load.        |
| Reliability      | The driver application shall reconnect automatically after loss of data connectivity and shall buffer location points while offline.                                             |
| Battery and data | Location shall be sent at intervals of approximately 5 to 10 seconds or after movement of about 10 metres. Payloads shall be minimal (latitude, longitude, speed, timestamp).    |
| Security         | Passwords shall be stored using a strong salted hash; all traffic shall use HTTPS; sensitive documents shall be encrypted at rest; login attempts shall be rate limited.         |
| Privacy          | Children's home locations and identity documents are sensitive personal data. Access shall be limited to the assigned driver (during active trips) and the tenant administrator. |
| Tenant isolation | Every query and every real-time subscription shall be restricted to the requesting user's tenant and, where relevant, trip.                                                      |
| Scalability      | The backend shall be stateless; live positions shall be held in an in-memory store; persistent records shall be held in the relational database.                                 |
| Usability        | Interfaces shall be simple enough for drivers using low-cost Android devices; language options (English and Urdu) should be considered.                                          |

7\. System Architecture

The system follows a client-server architecture with a central backend service, an in-memory store for live data, a relational spatial database, and external open-source or managed services for routing, geocoding, notifications and payments.

<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Flutter Mobile Application</strong></p>
<p><strong>(Driver and Student/Parent)</strong></p></td>
<td><p><strong>React Administration Portal</strong></p>
<p><strong>(Tenant and platform administrators)</strong></p></td>
</tr>
<tr class="even">
<td colspan="2"><p><strong>Backend: Spring Boot 3 (Java 21)</strong></p>
<p><strong>REST API, WebSocket (STOMP), JWT security with tenant filter, route service, notification service, verification, SOS and fee services</strong></p></td>
</tr>
<tr class="odd">
<td><p><strong>Redis</strong></p>
<p><strong>Latest vehicle positions, geo queries, notification flags, route cache</strong></p></td>
<td><p><strong>PostgreSQL with PostGIS</strong></p>
<p><strong>Accounts, tenants, routes, attendance, trips, events, fees, verification records</strong></p></td>
</tr>
<tr class="even">
<td><strong>OSRM (routing)</strong></td>
<td><strong>Nominatim / OSM (geocoding, tiles)</strong></td>
</tr>
<tr class="odd">
<td><strong>Firebase Cloud Messaging (push)</strong></td>
<td><strong>Payment gateway (webhooks)</strong></td>
</tr>
</tbody>
</table>

*Figure 1. Logical architecture (clients communicate with the backend over HTTPS and WebSocket; the backend uses the data stores and external services shown below it).*

7.1 Technology Selection

| **Layer** | **Technology**                                    | **Remarks**                                                                                          |
|-----------|---------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Backend   | Java 21, Spring Boot 3                            | Virtual threads may be enabled for high-concurrency connections.                                     |
| Database  | PostgreSQL with PostGIS                           | Spatial storage and queries for stops and events.                                                    |
| Live data | Redis                                             | Latest position per trip; geographic radius queries; caching.                                        |
| Mobile    | Flutter (Dart)                                    | One codebase for Android and iOS; separate role screens.                                             |
| Admin web | React with TypeScript                             | Tailwind CSS suggested for styling. Flutter Web is an alternative to reduce the number of languages. |
| Maps      | OpenStreetMap via flutter_map                     | Free; tile usage policy applies; use a suitable tile provider for production.                        |
| Routing   | OSRM Trip and Route APIs                          | Public demo server for development only; self-host for production.                                   |
| Geocoding | Nominatim                                         | Public server is rate limited (about one request per second).                                        |
| Push      | Firebase Cloud Messaging                          | Free service for push notifications.                                                                 |
| Payments  | Local gateway (for example JazzCash or Easypaisa) | Merchant account required; not free.                                                                 |

7.2 Identification and Login Design

Users authenticate with a human-readable identifier and password. The backend resolves the identifier to the user record, verifies the password hash, and returns a JSON Web Token containing the user identifier, tenant identifier and role. The client then routes to the appropriate interface. Identifier prefixes indicate the role (SUP, SCH-nn-ADM, DRV, STU). Identifiers are generated on the server; driver identifiers are issued only after verification.

8\. Database Design

The data model below extends the initial six tables with the entities required for routes, per-day attendance, trips, trip events, vehicles and emergency alerts. Live vehicle positions are held in Redis rather than in the relational database, since writing every location update to PostgreSQL would create unnecessary load; only sampled points and events are persisted. The complete SQL definition is provided in Appendix A.

| **Table**            | **Purpose**                             | **Key fields**                                                                           |
|----------------------|-----------------------------------------|------------------------------------------------------------------------------------------|
| tenants              | Institutions using the platform         | name, type, cut-off time, campus location                                                |
| users                | All accounts                            | custom_id, role, tenant_id, password_hash, fcm_token                                     |
| driver_verifications | Verification records                    | CNIC, license number and expiry, vehicle registration, document photos, status, reviewer |
| vehicles             | Registered vehicles                     | tenant_id, registration number, capacity                                                 |
| routes               | Named routes                            | tenant_id, driver_id, vehicle_id, start time, direction                                  |
| student_stops        | Pick-up locations                       | student_id, route_id, location (spatial point)                                           |
| daily_attendance     | Per-day Going / Not Going               | student_id, trip_date, status, boarded; unique per student and date                      |
| trips                | Each run of a route                     | route_id, driver_id, date, status, start and end times                                   |
| trip_events          | Arrival, pickup, speed and other events | trip_id, student_id, event type, location, speed                                         |
| fee_transactions     | Fee ledger                              | student_id, month, amounts, commission, status, gateway reference, receipt               |
| sos_events           | Emergency alerts                        | trip_id, raised_by, location, resolved flag                                              |

9\. Key Operational Workflows

9.1 Driver Onboarding and Verification

1.  The driver registers in the application and uploads the national identity number, license number, vehicle registration number and document photographs. The account status is Pending.

2.  The tenant or platform administrator reviews the submission through the web portal.

3.  On approval, the status becomes Verified, the system issues a driver identifier and notifies the driver. On rejection, the reason is recorded and the driver may resubmit.

9.2 Daily Attendance and Dynamic Route Update

1.  Before the tenant's cut-off time the student or parent marks the trip as Going or Not Going. The system records the choice for that date.

2.  When a student is marked Not Going, the system collects the remaining Going students for the route and calls the routing engine to determine the best visiting order.

3.  The updated stop order and route line are sent to the driver through the WebSocket connection; the absent student's pin disappears and the driver receives a notification.

4.  After the cut-off time, changes are locked (or require administrator override). The route is recomputed once more when the trip starts.

9.3 Live Tracking and Five-Minute Proximity Alert

1.  The driver application sends latitude, longitude, speed and timestamp about every five seconds, or after movement of about ten metres.

2.  The backend stores the latest position in Redis and broadcasts it to parents subscribed to that specific trip.

3.  For the next unvisited stop, the estimated time of arrival is obtained from the routing engine and refreshed periodically (for example every 30 to 60 seconds) rather than on every location update.

4.  When the estimate is five minutes or less and no notification has yet been sent for that stop, a push notification is dispatched to the parent and the event is recorded. A distance check of about one kilometre serves as a low-cost fallback trigger.

9.4 Emergency Alert

1.  The driver or student presses the emergency button and confirms the action to prevent accidental use.

2.  The system records the event and sends a high-priority notification to the tenant administrator and all parents on the trip, including a link to the live location.

3.  The administrator investigates and marks the event as resolved.

The first release limits notification to administrators and parents. Integration with police, ambulance or other emergency services is not included and should not be promised to users.

9.5 Fee Payment

1.  A scheduled process creates a Pending fee record for each student at the start of every month.

2.  The parent pays through the payment gateway. The gateway's callback is authenticated by signature before the record is set to Paid and the gateway reference is stored.

3.  A digital receipt is generated and the parent is notified. Where a platform commission applies, the net driver amount is calculated and stored.

10\. Interface Specification

10.1 REST Endpoints

| **Method** | **Path (prefix /api/v1)**                       | **Purpose**                                               |
|------------|-------------------------------------------------|-----------------------------------------------------------|
| POST       | /auth/login                                     | Authenticate with identifier and password; returns token. |
| POST       | /drivers/register                               | Submit driver documents.                                  |
| GET, PATCH | /admin/drivers, /admin/drivers/{id}/verify      | List pending drivers; approve or reject.                  |
| POST, GET  | /admin/students, /admin/routes, /admin/vehicles | Manage students, routes and vehicles.                     |
| PUT        | /students/me/stop                               | Set the pick-up location.                                 |
| PUT        | /students/me/attendance                         | Set Going or Not Going for a date.                        |
| POST       | /trips/{id}/start, /trips/{id}/end              | Start or end a trip.                                      |
| POST       | /trips/{id}/stops/{studentId}/status            | Record arrived, picked up or no-show.                     |
| GET        | /trips/{id}/route                               | Retrieve current ordered stops and route line.            |
| POST       | /sos                                            | Raise an emergency alert.                                 |
| GET, POST  | /fees/me, /fees/{id}/pay, /webhooks/payment     | View fees, initiate payment, receive gateway callback.    |

10.2 Real-Time Channels

- Driver publishes location to /app/driver/telemetry.

- Parents subscribe to a per-trip topic, /topic/trips/{tripId}/location. A single shared topic for all vehicles must not be used, because it would expose every vehicle to every user.

- The driver subscribes to private queues for route updates and attendance changes.

- Every subscription must be authorized against the user's tenant and assigned trip.

11\. Route Optimization

The route service constructs an ordered coordinate list consisting of the driver's starting position, the stops of students marked Going, and the campus. It calls the OSRM Trip service with the start fixed as the first point and the campus fixed as the last point, so that the optimized order does not end at an arbitrary residence. For afternoon drop-off the start and end are reversed. The response contains the optimized route line and, for each input point, its position in the optimized order; the service must map these positions back to students. A reference implementation is given in Appendix B.

Operational points: results should be cached per route and date and recomputed only when attendance changes or the trip starts; the public OSRM demonstration server carries no service guarantee and should be replaced by a self-hosted instance using a Pakistan map extract before real users are onboarded.

12\. Mobile Application Considerations

- The driver application must run a foreground service with a persistent notification and request background location permission on Android and iOS.

- Battery optimization on some Android devices terminates background services. Drivers should be guided to exempt the application and to keep the phone connected to a vehicle charger.

- Location points should be buffered locally during connectivity loss and uploaded on reconnection.

- Library APIs change between versions; the map, location and messaging packages should be pinned and their current documentation consulted (for example, recent versions of flutter_map use initialCenter and initialZoom rather than the older center and zoom options).

- Push notifications use Firebase Cloud Messaging even though the map and routing components are free.

13\. Security and Privacy

| **Area**         | **Measures**                                                                                                                                               |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Authentication   | Salted password hashing (BCrypt or Argon2); short-lived tokens with refresh; login rate limiting and lockout.                                              |
| Authorization    | Role checks and mandatory tenant filter on all queries; per-trip authorization for real-time subscriptions.                                                |
| Sensitive data   | Encrypt identity numbers and document images at rest; restrict document access to administrators; retain only as long as required.                         |
| Location privacy | Home locations visible only to the assigned driver on active trips and to the tenant administrator; no location sharing outside the trip window.           |
| Transport        | HTTPS for all endpoints; secure WebSocket connections; verify payment callbacks by signature.                                                              |
| Compliance       | Publish a privacy policy and terms of service; obtain parental consent for children's data; seek legal advice on data protection and on handling payments. |

14\. Business Model and Revenue Strategy

*All prices and figures in this section are illustrative planning values. They must be validated through discussions with drivers, institutions and parents before a price list is adopted.*

14.1 Customer Segments and Payers

| **Payer**                                          | **Value received**                                                                                                         | **Sales effort**                     |
|----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| Independent van drivers and operators              | Fewer coordination calls, fuel savings from skipped stops, a Verified badge that attracts parents, simpler fee collection. | Low; a single decision maker.        |
| Institutions (coaching centers, colleges, schools) | Attendance records, safety oversight, reduced administrative effort, parent satisfaction.                                  | Medium to high; approvals required.  |
| Parents                                            | Peace of mind, live tracking and alerts.                                                                                   | Low value per user; high churn risk. |

Recommended initial strategy: sell first to independent van drivers and coaching centers, where decisions are fast, and keep the parent application free so that drivers can invite families easily. Approach schools and universities after the pilot has produced measurable results.

14.2 Revenue Streams

| **Stream**                        | **Description**                                                                                                                                                                  | **Notes**                                                                                                                                                                                                                           |
|-----------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Subscription (primary)            | Monthly fee per vehicle for drivers or operators, with student limits by tier; per-vehicle or per-student fee for institutions, including the administration portal and reports. | Recurring, predictable; the recommended main source.                                                                                                                                                                                |
| Platform fee on payments          | A small percentage of online fee payments retained by S.T.M.S. The schema supports a commission field.                                                                           | If the platform holds other parties' funds, financial regulation may apply (for Pakistan, consult State Bank of Pakistan requirements and gateway terms). Prefer gateway-level payment splitting or a fixed subscription initially. |
| Onboarding fee                    | One-time fee for institutions covering student import, route setup and staff training.                                                                                           | Uses the installation fee field.                                                                                                                                                                                                    |
| Premium add-ons                   | SMS or WhatsApp alerts, trip history and reports, over-speed reports, family plans, additional administrator seats.                                                              | Message-based services have per-message costs and should be charged.                                                                                                                                                                |
| White-label and custom deployment | Branded versions and integrations for large institutions and fleet companies.                                                                                                    | Higher price, longer sales cycle.                                                                                                                                                                                                   |
| Partnerships                      | Referral arrangements with vehicle insurance or maintenance providers.                                                                                                           | Low priority. Children's data must never be sold and advertising directed at students should be avoided.                                                                                                                            |

14.3 Illustrative Pricing Structure

| **Plan**   | **Target**                         | **Illustrative price**                                                     | **Included**                                                           |
|------------|------------------------------------|----------------------------------------------------------------------------|------------------------------------------------------------------------|
| Free       | Any driver, up to about 5 students | PKR 0                                                                      | Tracking, Going / Not Going, basic route                               |
| Driver Pro | Independent van operator           | About PKR 1,000 to 2,000 per month                                         | Up to about 25 students, dynamic routing, Verified badge, fee tracking |
| Institute  | Coaching center or college         | About PKR 2,000 to 3,000 per vehicle per month, or a small per-student fee | Administration portal, multiple vehicles, reports, priority support    |
| Enterprise | Schools, universities, fleets      | Custom                                                                     | White-label, integrations, service-level agreement                     |

14.4 Cost Structure

- Hosting for the backend, PostgreSQL, Redis and a self-hosted OSRM instance (routing requires substantial memory for a national map extract).

- SMS and WhatsApp messaging, charged per message; push notifications through FCM are free.

- Payment gateway transaction fees and any merchant setup costs.

- Application store accounts (Google Play one-time registration; Apple Developer annual fee).

- Domain, certificates, backups, monitoring and error tracking.

- Customer support and driver onboarding time.

- Legal and compliance costs, including a privacy policy and advice on payments and personal data.

14.5 Illustrative Revenue Example

| **Item**                                      | **Assumption**                    | **Monthly amount (PKR)** |
|-----------------------------------------------|-----------------------------------|--------------------------|
| Driver subscriptions                          | 100 vans at 1,500                 | 150,000                  |
| Institute subscriptions                       | 10 institutes at 10,000           | 100,000                  |
| Gross recurring revenue                       |                                   | 250,000                  |
| Less: hosting, messaging, gateway and support | To be estimated from actual usage | To be determined         |

The example shows the method only. The number of vehicles required to break even should be calculated from real cost and price data collected during the pilot.

14.6 Go-to-Market Plan

1.  Pilot: one to three vans and twenty to fifty families in a single area, free of charge, to prove location reliability and the daily attendance habit.

2.  Referral: each driver invites parents; satisfied parents introduce other parents and institutions.

3.  Expansion: coaching centers and colleges that operate several vans without a system.

4.  Monetization: introduce subscriptions once visible time and fuel savings are demonstrated; add premium features and payment commissions after payments operate reliably.

5.  Institutional sales: approach schools and universities with pilot data, case studies and the verification and safety proposition.

14.7 Key Performance Indicators

- Active vehicles, active students and daily attendance-declaration rate.

- Monthly recurring revenue and churn of drivers or institutions.

- Notification accuracy and on-time arrival.

- Payment volume through the application and failed-payment rate.

- Cost per active vehicle (hosting, messaging, support).

14.8 Business Risks

- Drivers may resist paying for a service they consider free; the fuel and time savings and the parent-trust benefit must be demonstrated.

- Parents may be unwilling to pay; the parent side should remain free or inexpensive and revenue should come from the party who earns income from transport.

- Competitors may copy dynamic stop skipping; durable advantages are verification, local payment integration, multi-institution support and daily habit among drivers.

- Some drivers operate in cash and may prefer manual fee recording; the first release should permit an administrator or driver to mark fees as paid manually.

15\. Delivery Plan

The initial estimate of six to eight weeks for a single full-time developer is optimistic for a first project of this breadth (backend, two mobile roles and a web portal). A realistic plan for one developer working part-time is approximately three to four months; eight weeks should be treated as the best case. The most valuable approach is to build a thin end-to-end slice first: driver location to parent map, then everything else.

| **Phase**                      | **Deliverables**                                                                               |
|--------------------------------|------------------------------------------------------------------------------------------------|
| 0\. Setup                      | Repository, docker-compose environment (PostGIS, Redis, OSRM), continuous integration basics.  |
| 1\. Authentication and tenants | Custom-identifier login, tokens, roles, tenant filter, identifier generator.                   |
| 2\. Driver verification        | Driver registration, document upload, administrator review interface.                          |
| 3\. Students and stops         | Stop selection on map with address search, routes, driver assignment.                          |
| 4\. Attendance and routing     | Going / Not Going with cut-off, routing integration, driver route map.                         |
| 5\. Live tracking              | Foreground location service, WebSocket, Redis, parent live map, estimated arrival.             |
| 6\. Notifications              | Push notification setup, five-minute alert, attendance alerts.                                 |
| 7\. Safety                     | Emergency alert, over-speed logging, campus geofence.                                          |
| 8\. Fees                       | Ledger, receipts, manual marking, then gateway integration.                                    |
| 9\. Pilot                      | Real-world test with a small number of vans and families; correct battery and location issues. |

16\. Testing and Quality Assurance

| **Type**          | **Coverage**                                                                                                                               |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Unit tests        | Identifier generation, cut-off logic, route order mapping, fee calculation.                                                                |
| Integration tests | PostGIS, Redis and the API using containerized dependencies; tenant isolation.                                                             |
| Security tests    | A user of one tenant must not access another tenant's data; students must not subscribe to other trips; token expiry and role enforcement. |
| Field tests       | Locked screen, battery saver enabled, weak mobile data, loss of signal, low-cost Android devices.                                          |
| Load tests        | Simulated drivers sending updates with many parent subscribers; route recalculation under concurrent attendance changes.                   |
| Acceptance        | Pilot with real drivers and families using agreed success criteria.                                                                        |

17\. Risks, Assumptions and Open Decisions

17.1 Technical and Operational Risks

| **Risk**                                                | **Mitigation**                                                                                |
|---------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Background location termination on Android and iOS      | Foreground service, battery exemption guidance, early testing on real devices.                |
| Reliance on public OSRM, Nominatim and OSM tile servers | Self-host OSRM; respect usage policies; use an appropriate tile provider before launch.       |
| Payment gateway approval and fees                       | Begin with manual payment marking; apply for merchant accounts early.                         |
| Handling of identity documents and children's locations | Encryption, minimal access, privacy policy, legal advice.                                     |
| Unrealistic emergency integration claims                | Limit first release to administrators and parents; do not promise emergency service dispatch. |
| Solo-developer workload across three technologies       | Build the thin slice first; consider Flutter Web for the administration portal.               |

17.2 Open Decisions

1.  Payments: begin with manual payment marking or integrate a gateway in the first release?

2.  Cut-off policy: what happens if a student changes their mind after the cut-off time?

3.  Accounts: may one parent account manage several children?

4.  Trips: are morning pickup and afternoon drop-off governed by the same attendance declaration or separate ones?

5.  Pricing and payer: which segment is charged first, and at what price?

17.3 Corrections to the Initial Blueprint

- The sample routing code used an inappropriate JSON import, created a new HTTP client on every call, discarded the optimized stop order and did not fix the end point; these are corrected in Appendix B.

- A single shared real-time topic for all vehicles would leak locations; per-trip topics with authorization are specified instead.

- Writing vehicle position to a relational table every few seconds was replaced by an in-memory store.

- A single status field on the stop could not store history; a per-day attendance table is used.

- Statements such as route recalculation in under 50 milliseconds and support for hundreds of thousands of connections are unmeasured claims and are not adopted as requirements.

- The six-to-eight-week schedule is retained only as a best case.

Appendix A. Database Schema (PostgreSQL with PostGIS)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE tenants (

id BIGSERIAL PRIMARY KEY,

name VARCHAR(255) NOT NULL,

type VARCHAR(20) NOT NULL, -- SCHOOL, COLLEGE, UNIVERSITY, COACHING

contact_email VARCHAR(100) UNIQUE NOT NULL,

attendance_cutoff_time TIME NOT NULL DEFAULT '06:00',

destination GEOMETRY(Point,4326),

created_at TIMESTAMP DEFAULT now()

);

CREATE TABLE users (

id BIGSERIAL PRIMARY KEY,

tenant_id BIGINT REFERENCES tenants(id),

custom_id VARCHAR(50) UNIQUE NOT NULL, -- STU-2026-44, DRV-8802, SCH-01-ADM

name VARCHAR(100) NOT NULL,

phone VARCHAR(20),

email VARCHAR(100),

password_hash VARCHAR(255) NOT NULL,

role VARCHAR(20) NOT NULL, -- SUPER_ADMIN, ADMIN, DRIVER, STUDENT

fcm_token VARCHAR(255),

active BOOLEAN DEFAULT true,

created_at TIMESTAMP DEFAULT now()

);

CREATE TABLE driver_verifications (

id BIGSERIAL PRIMARY KEY,

driver_id BIGINT UNIQUE REFERENCES users(id),

cnic_number VARCHAR(20) UNIQUE NOT NULL,

license_number VARCHAR(50) UNIQUE NOT NULL,

license_expiry DATE,

vehicle_reg_number VARCHAR(50) NOT NULL,

cnic_photo_url TEXT, license_photo_url TEXT, vehicle_photo_url TEXT,

status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED

rejection_reason TEXT,

reviewed_by BIGINT REFERENCES users(id),

verified_at TIMESTAMP

);

CREATE TABLE vehicles (

id BIGSERIAL PRIMARY KEY,

tenant_id BIGINT REFERENCES tenants(id),

reg_number VARCHAR(50) UNIQUE NOT NULL,

capacity INT

);

CREATE TABLE routes (

id BIGSERIAL PRIMARY KEY,

tenant_id BIGINT REFERENCES tenants(id),

name VARCHAR(100) NOT NULL,

driver_id BIGINT REFERENCES users(id),

vehicle_id BIGINT REFERENCES vehicles(id),

start_time TIME,

direction VARCHAR(10) -- TO_CAMPUS, FROM_CAMPUS

);

CREATE TABLE student_stops (

id BIGSERIAL PRIMARY KEY,

student_id BIGINT UNIQUE REFERENCES users(id),

route_id BIGINT REFERENCES routes(id),

stop_name VARCHAR(255),

location GEOMETRY(Point,4326) NOT NULL

);

CREATE TABLE daily_attendance (

id BIGSERIAL PRIMARY KEY,

student_id BIGINT REFERENCES users(id),

trip_date DATE NOT NULL,

status VARCHAR(20) NOT NULL DEFAULT 'GOING', -- GOING, NOT_GOING

boarded BOOLEAN DEFAULT false,

marked_at TIMESTAMP DEFAULT now(),

UNIQUE (student_id, trip_date)

);

CREATE TABLE trips (

id BIGSERIAL PRIMARY KEY,

route_id BIGINT REFERENCES routes(id),

driver_id BIGINT REFERENCES users(id),

trip_date DATE NOT NULL,

status VARCHAR(20) DEFAULT 'IDLE', -- IDLE, IN_PROGRESS, COMPLETED

started_at TIMESTAMP, ended_at TIMESTAMP

);

CREATE TABLE trip_events (

id BIGSERIAL PRIMARY KEY,

trip_id BIGINT REFERENCES trips(id),

student_id BIGINT REFERENCES users(id),

event_type VARCHAR(30) NOT NULL,

location GEOMETRY(Point,4326),

speed_kmh DOUBLE PRECISION,

created_at TIMESTAMP DEFAULT now()

);

CREATE TABLE fee_transactions (

id BIGSERIAL PRIMARY KEY,

student_id BIGINT REFERENCES users(id),

period_month DATE NOT NULL,

monthly_fee DECIMAL(10,2) NOT NULL,

installation_fee DECIMAL(10,2) DEFAULT 0,

platform_commission_pct DECIMAL(5,2) DEFAULT 0,

net_driver_payout DECIMAL(10,2),

status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PAID, FAILED

gateway_ref VARCHAR(100),

receipt_url VARCHAR(255),

paid_at TIMESTAMP

);

CREATE TABLE sos_events (

id BIGSERIAL PRIMARY KEY,

trip_id BIGINT REFERENCES trips(id),

raised_by BIGINT REFERENCES users(id),

location GEOMETRY(Point,4326),

resolved BOOLEAN DEFAULT false,

created_at TIMESTAMP DEFAULT now()

);

CREATE INDEX idx_stops_location ON student_stops USING GIST (location);

Appendix B. Route Optimization Service (Reference Implementation)

The following Java sketch uses Jackson for parsing and Spring's RestClient. Coordinates are supplied as longitude, latitude pairs. The first element is the start point and the last is the campus.

@Service

public class RouteOptimizationService {

private final RestClient client;

private final ObjectMapper mapper;

public RouteOptimizationService(@Value("\${osrm.base-url}") String baseUrl, ObjectMapper mapper) {

this.client = RestClient.builder().baseUrl(baseUrl).build();

this.mapper = mapper;

}

/\*\* coords: \[driverStart, stop1, stop2, ..., campus\] as {lng, lat}. \*/

public OptimizedRoute optimize(List\<double\[\]\> coords) throws IOException {

String path = coords.stream()

.map(c -\> c\[0\] + "," + c\[1\])

.collect(Collectors.joining(";"));

String body = client.get()

.uri("/trip/v1/driving/" + path

\+ "?source=first&destination=last&roundtrip=false"

\+ "&geometries=polyline&overview=full")

.retrieve().body(String.class);

JsonNode root = mapper.readTree(body);

if (!"Ok".equals(root.path("code").asText())) {

throw new RoutingException(body);

}

String polyline = root.path("trips").get(0).path("geometry").asText();

// waypoints\[i\].waypoint_index = position of input point i in the optimized trip

List\<Integer\> order = new ArrayList\<\>();

for (JsonNode w : root.path("waypoints")) {

order.add(w.path("waypoint_index").asInt());

}

return new OptimizedRoute(order, polyline);

}

}

Appendix C. Recommended Project Structure

stms/

backend/ (Spring Boot)

src/main/java/com/stms/

config/ security, websocket, redis

auth/ login, tokens, identifier generation

tenant/ tenants, vehicles, routes

driver/ verification

student/ stops, attendance

trip/ trips, telemetry, events

routing/ routing-engine client

notify/ push notifications

sos/ emergency alerts

fees/ ledger, receipts, payments

mobile/ (Flutter) features: auth, driver, student, shared

admin-web/ (React and TypeScript)

infra/ docker-compose: PostgreSQL+PostGIS, Redis, OSRM

**Immediate next steps:** (1) create the repository and container environment; (2) implement the schema as versioned migrations; (3) build authentication with tenant filtering; (4) prototype the driver-to-parent live location loop using two phones before building further features.