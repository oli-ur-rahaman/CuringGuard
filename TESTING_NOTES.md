# CuringGuard Testing Notes & Plan

## Testing Strategy
We will systematically test each feature of the application, starting from user authentication, role-based access, and progressing through project management, geometry mapping, contractor actions, and automated notifications.

## Testing Phases

### 1. Authentication & Role Management
- [ ] Superadmin Login & Dashboard
- [ ] Monitor Login & Dashboard 
- [ ] Contractor Login & Mobile Interface
- [ ] Unauthorized Access Prevention

### 2. Monitor Admin Setup (Superadmin Portal)
- [x] Create Monitor Admin (Replaced "Deploy Tenant")
- [x] Enforce Unique Email Constraint (Removed mobile_number uniqueness)
- [x] Strict 6-character password enforcement on Creation and Auth Reset
- [x] Edit Monitor Admin Details (Name, Email, WhatsApp)
- [x] Toggle Status (Suspend/Reactivate - affects Login)
- [x] Verify UI Aesthetic (Removed redundant badges, relying on Color Borders)
- [x] Removed Delete Button (Rule: Never destroy functioning things if not strictly needed)

### 3. Project Setup (Monitor)
- [ ] Create/Edit Project
- [ ] Hierarchy Creation (Package > Structure > Drawing)
- [ ] Assign Contractors to Structures

### 4. Geometry Parsing & Plans Canvas
- [ ] Upload & Parse DWG/DXF files
- [ ] Canvas Rendering (Pan, Zoom, Responsiveness)
- [ ] Grouping and Mapping Elements to Database

### 5. Contractor Field Operations (Mobile View)
- [ ] View Assigned Tasks/Structures
- [ ] "Tap-to-Group" functionality
- [ ] Log Curing Start
- [ ] Verify Calculation of Curing End Date

### 6. Automated Background Tasks (Cron & SMS)
- [ ] Verify Background Cron Job Scanning
- [ ] Test Green Heritage IT SMS API Integration
- [ ] Trigger Manual "Ping" Notifications
- [ ] End-to-End Automated Testing (Playwright)

---

## Detailed Notes & Modifications

### Recent Fixes & Adjustments:
- **Identity Architecture Migration:** Completely stripped `tenant_id` from the database in favor of a flattened `User` structure where roles determine access.
- **Login Stabilization:** Fixed a severe bug where tokens were instantly expiring due to an implicit Python timezone conversion (`datetime.utcnow()`).
- **Database Rules:** Lifted the unique constraint on `mobile_number` to allow re-use. Enforced strict uniqueness on `email` to serve as the primary unique identifier.
- **Aesthetic Overhaul:** Adopted `#019AA7` and `#0047B8` as primary theme colors. Removed redundant "Online" badges in favor of bold top-borders to maintain a premium, uncluttered aesthetic.

