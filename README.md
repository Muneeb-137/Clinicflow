# ClinicFlow

### Real-Time Clinic Operations & Patient Flow Management

**ClinicFlow** is a full-stack clinic management platform designed to improve how healthcare facilities manage appointments, patient queues, physician availability, and waiting times.

The platform provides dedicated portals for **clinic staff, physicians, and patients**, bringing scheduling, patient flow, and operational visibility into one centralized application.

At its core, ClinicFlow features a **dynamic wait-time prediction engine** that uses live clinic conditions, provider availability, consultation durations, and queue information to estimate patient waiting times.

**Tech Stack:** React 19 · TypeScript · Node.js · Express 5 · PostgreSQL · Socket.IO · Tailwind CSS

---

## Overview

Traditional clinic workflows often rely on manual queue tracking, disconnected scheduling systems, and static waiting-time estimates.

ClinicFlow addresses these challenges through a unified platform that supports:

- **Real-Time Queue Management** — Track patients from check-in through consultation completion.
- **Dynamic Wait-Time Estimation** — Generate projected waiting times using current clinic conditions.
- **Appointment Scheduling** — Manage physician availability, bookings, and appointment calendars.
- **Provider Status Tracking** — Monitor physician availability and active consultations.
- **Patient Self-Service** — Allow patients to book appointments and view queue information.
- **Operational Analytics** — Provide insight into clinic activity and waiting-time performance.

The goal is to improve clinic efficiency while providing patients with greater transparency about their appointments and expected waiting times.

---

## Core Features

### 1. Appointment Booking & Management

ClinicFlow provides a structured appointment workflow for both staff and patients.

- Multi-step booking process with visit reason, physician, date, and time selection
- Physician-specific appointment availability
- Booking validation and temporary reservation holds
- Appointment confirmation and cancellation
- Scheduled and walk-in appointment management
- Missed and cancelled appointment tracking
- Patient appointment history and upcoming visits

### 2. Live Patient Queue

A centralized queue provides visibility into patient movement throughout the clinic.

- Real-time patient check-in
- Separate scheduled and walk-in queues
- Queue status tracking: **Scheduled → Checked In → Roomed → Completed**
- Examination room assignments
- Physician-specific queues
- Patient-facing queue information
- Live updates across connected portals

### 3. Dynamic Wait-Time Prediction Engine

One of ClinicFlow's primary technical features is its provider-aware wait-time prediction system.

Rather than displaying a fixed average, the engine is designed to estimate waits based on current clinic operations.

**Prediction inputs include:**

- Number of patients currently waiting
- Scheduled versus walk-in appointment type
- Expected consultation duration
- Physician availability and current consultations
- Estimated provider readiness
- Walk-in acceptance windows
- Queue order and patient assignment constraints
- Scheduling and operational capacity

**Core backend modules:**

| Module | Responsibility |
|---|---|
| `ClinicStateBuilder` | Builds the current operational clinic state |
| `DurationEstimator` | Estimates appointment and consultation durations |
| `ProviderEligibility` | Evaluates physician availability and eligibility |
| `PredictionEngine` | Coordinates wait-time prediction logic |
| `QueueSimulator` | Simulates patient progression through the queue |
| `LivePredictions` | Supports live prediction calculations |
| `WalkInAdmission` | Handles walk-in admission logic |
| `WaitTimeAnalytics` | Supports analytics and wait-time reporting |

Wait-time estimates are projections, not guaranteed consultation start times. Actual waits may vary with clinic conditions.

### 4. Physician Scheduling & Availability

- Physician schedules and working hours
- Calendar-based appointment management
- Appointment slot availability
- Walk-in acceptance windows
- Provider status updates
- Active consultation tracking
- Scheduling conflict prevention

### 5. Role-Based Portals

ClinicFlow provides dedicated interfaces tailored to each user role.

| Staff Portal | Doctor Portal | Patient Portal |
|---|---|---|
| Operations dashboard | Physician dashboard | Patient dashboard |
| Patient management | Assigned appointments | Book appointments |
| Appointment booking | Personal patient queue | Appointment history |
| Calendar and scheduling | Consultation status | Live queue visibility |
| Live queue management | Provider availability | Profile management |
| Room and provider status | Daily workflow | Account security |
| Analytics and reporting | | |

### 6. Real-Time Synchronization

ClinicFlow uses **Socket.IO** to support real-time communication between the backend and frontend.

This enables the application to refresh operational information when appointments, queue states, or provider availability change, reducing reliance on manual page refreshes.

### 7. Analytics & Reporting

- Clinic operational dashboards
- Scheduled and walk-in waiting-time insights
- Queue and patient-flow information
- Wait-time trends and analytics
- Provider and clinic activity visibility

---

## Technology Stack

| Category | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, CSS |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL |
| Real-Time Communication | Socket.IO |
| API | REST |
| Authentication | Role-based authentication and protected routes |
| Version Control | Git, GitHub |

---

## Project Structure

```text
Clinicflow/
│
├── clinicflow-server/             # Backend application
│   ├── sql/                       # Database schema and SQL scripts
│   ├── src/
│   │   ├── middleware/            # Authentication and authorization
│   │   ├── routes/                # REST API endpoints
│   │   ├── services/              # Application business logic
│   │   │   └── waittime/          # Wait-time prediction engine
│   │   ├── scripts/               # Administrative scripts
│   │   ├── utils/                 # Shared backend utilities
│   │   ├── db.ts                  # PostgreSQL connection
│   │   ├── socket.ts              # Socket.IO configuration
│   │   └── server.ts              # Server entry point
│   └── package.json
│
├── clinicflow-web/                # React frontend
│   ├── public/                    # Static resources
│   ├── src/
│   │   ├── assets/                # Images and branding
│   │   ├── animations/            # UI animations
│   │   ├── components/            # Reusable UI components
│   │   │   ├── analytics/
│   │   │   └── waittime/
│   │   ├── context/               # Authentication contexts
│   │   ├── dashboard/             # Dashboard components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── lib/                   # API utilities
│   │   ├── pages/                 # Application pages
│   │   ├── types/                 # TypeScript definitions
│   │   ├── utils/                 # Helper functions
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── docs/                          # Documentation and testing notes
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

Before running ClinicFlow, ensure you have:

- Node.js 20+
- npm
- PostgreSQL
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Muneeb-137/Clinicflow.git
cd Clinicflow
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd clinicflow-server
npm install
```

Create your environment configuration:

```bash
cp .env.example .env
```

Update `.env` with the database connection, authentication secrets, and any required service credentials.

### 3. Database Setup

Create a PostgreSQL database and configure the connection in the backend environment file.

Database schema and migration scripts are stored in:

```text
clinicflow-server/sql/
```

Apply the required SQL scripts in their intended order.

### 4. Start the Backend

```bash
npm run dev
```

**Default API URL:** `http://localhost:5000`

### 5. Frontend Setup

Open a separate terminal from the repository root:

```bash
cd clinicflow-web
npm install
cp .env.example .env
```

Configure the frontend environment variables using the example file.

### 6. Start the Frontend

```bash
npm run dev
```

**Default Web URL:** `http://localhost:5173`

Keep both the frontend and backend running during development.

---

## Security & Data Handling

ClinicFlow includes authentication and authorization middleware, protected application routes, input validation, rate limiting, and account security functionality.

For local development:

- Never commit `.env` files or real credentials.
- Use placeholder values in `.env.example` files.
- Avoid storing real patient information in development databases.
- Review authentication, access controls, and data handling before any production deployment.

ClinicFlow is a development project and should not be considered certified or production-ready for handling protected healthcare information without additional security, privacy, and compliance assessment.

---

## Development Status

**Active Development**

ClinicFlow is being developed as a full-stack clinic operations platform, with a focus on appointment scheduling, real-time patient flow, provider-aware wait-time estimation, and operational analytics.

Areas for continued refinement include prediction accuracy, queue-state consistency, scheduling edge cases, automated testing, and production readiness.

---

## Repository

**GitHub:** https://github.com/Muneeb-137/Clinicflow

---

**ClinicFlow — Smarter Scheduling. Better Patient Flow.**
