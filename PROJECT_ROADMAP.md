# CuringGuard: Complete Project Roadmap

This document outlines the overarching sequence of how we are constructing this platform, organized into clear, actionable phases.

---

## ✅ Phase 1: Foundation (The Engine Room) 
**Status: COMPLETED**
**Goal:** Provide the core infrastructure so the Frontend has a database to talk to and the Geometry engine has the tools to read architectural files.
*   [x] Initialize the **FastAPI (Python)** server inside the `backend/` directory.
*   [x] Set up Laragon MySQL database connection.
*   [x] Prepare Python `ezdxf` understanding for `@Geometry-Engineer`.

---

## ✅ Phase 2: DWG Geometry & Canvas Integration
**Status: COMPLETED**
**Goal:** Turn standard CAD drawing files into clickable visual objects on a dashboard.
*   [x] Build the `Plans.tsx` Canvas UI to render and group elements.
*   [x] Implement native multi-touch pan/zoom physics.
*   [x] Map styling (micro-scrollbars, full-bleed aesthetic).

---

## ✅ Phase 3: The Data Hierarchy & Database Setup
**Status: COMPLETED**
**Goal:** Build the strict structural rules separating Monitors, Projects, and Contractors.
*   [x] Restructure Identity Management: Flattened the `User` table to remove the siloing `tenant_id` constraint, using a global identity model.
*   [x] Create Frontend interfaces for Monitor Management (`Superadmin.tsx`, `ProjectSetup.tsx`).
*   [x] Create backend database models (`Monitor > Project > Package > Structure > Drawing`).
*   [x] Built the `GeometryElement` table (`curing.py`) to connect parsed vectors to Contractors.
*   [x] **CRITICAL:** Enforced strict 11-digit `mobile_number` field requirement for SMS routing.
*   [x] Physically created testing and synchronization script `test_db.py`.

---

## ✅ Phase 4: The Field Interface & API Endpoints
**Status: COMPLETED**
**Goal:** Connect the physical Mobile app view (which is already built) to the FastAPI backend, and store real curation timestamps in the database we just built.
*   [x] Develop the responsive `Contractors.tsx` interface for mobile browsers.
*   [x] Initialize and configure **FastAPI Endpoints** (`GET` / `POST` routes) so the Frontend "Tap-to-Group" UI can actually send data to PostgreSQL.
*   [x] Implement the backend math that takes a tapped component and automatically calculates the `curing_end_date` within the FastAPI route.
*   [x] Hooked all Frontend pages (Dashboard, Contractors, Project Setup, Plans, Superadmin) to live API.
*   [x] **Action 3:** Run the first actual parse of the architectural host dwg and load its vectors into the `GeometryElement` table.

---

## ⏳ Phase 5: Verification & SMS Automation
**Status: IN PROGRESS**
**Goal:** Make the system smart enough to run itself and message people when things go wrong.
*   [x] **Action 1:** Write the Python Cron jobs (automated background tasks) that scan the database every morning at 8:00 AM.
*   [x] Integrate the **Green Heritage IT SMS API** to automatically send a text to field workers. (Manual "Ping" implemented; Auto-Cron pending).
*   [x] **Action 3:** Build strict End-to-End browser tests (Playwright) via `@QA-Automation` so the whole flow is automated prior to real deployment.
