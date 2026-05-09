# CuringGuard Industrial-Grade Roadmap

Purpose:
- Track the implementation work needed to raise CuringGuard to a strong industrial-grade standard.
- Use this as the authoritative execution checklist.
- Later, you can tell me to "implement the roadmap" and I can mark completed work with `[x]`.

How to use:
- `[ ]` = not started
- `[x]` = completed
- Each phase contains sub-phases
- Each sub-phase contains concrete tasks
- Testing items should be updated with a result summary like:
  - `Testing report: 8/8 passed`
  - `Testing report: 7/8 passed, 1 failed`

---

## Phase 1: Security and Stability Foundation

### 1.1 Secrets and Authentication Hardening
- [ ] Remove hardcoded JWT fallback secret from backend auth config
- [ ] Make backend startup fail clearly if `SECRET_KEY` is missing
- [ ] Review JWT expiry policy and confirm intended session lifetime
- [ ] Evaluate moving auth token away from `localStorage`
- [ ] If token remains in browser storage, add compensating XSS protections and document the tradeoff
- [ ] Add logout/session invalidation strategy for sensitive role changes
- [ ] Testing
- [ ] Testing report: 0/0

### 1.2 Login and Account Protection
- [ ] Add rate limiting to `/api/auth/login`
- [ ] Add brute-force protection per username and per IP
- [ ] Add temporary lockout or cooldown after repeated failed logins
- [ ] Standardize auth error responses to avoid information leakage
- [ ] Review all password reset flows for abuse resistance
- [ ] Move password reset input from query params to request body
- [ ] Testing
- [ ] Testing report: 0/0

### 1.3 API Exposure and Environment Separation
- [ ] Disable `/docs` and `/openapi.json` in production mode
- [ ] Keep docs enabled only for development/staging or admin-restricted mode
- [ ] Split dev/staging/prod settings cleanly
- [ ] Narrow CORS policy by environment
- [ ] Review proxy and mobile launcher behavior so production settings cannot inherit dev behavior
- [ ] Testing
- [ ] Testing report: 0/0

### 1.4 Upload and File Handling Hardening
- [ ] Review every upload path for unsafe filename usage
- [ ] Sanitize filenames consistently on all upload endpoints
- [ ] Add file size limits for plans, images, and videos
- [ ] Validate extension, MIME type, and content signature consistently
- [ ] Add storage isolation rules for user-generated files
- [ ] Add upload failure cleanup review for all endpoints
- [ ] Design malware scan or quarantine workflow for uploads
- [ ] Testing
- [ ] Testing report: 0/0

### 1.5 Database and Runtime Stability
- [ ] Remove runtime schema mutation from app startup
- [ ] Adopt proper DB migrations
- [ ] Create migration history for all current schema drift
- [ ] Make backend startup health checks explicit
- [ ] Make DB unavailable state fail clearly and visibly
- [ ] Standardize startup order for DB, backend, frontend, and tunnel
- [ ] Testing
- [ ] Testing report: 0/0

### 1.6 Operational Startup Cleanup
- [ ] Ensure there is exactly one authoritative backend process
- [ ] Ensure there is exactly one authoritative frontend process
- [ ] Ensure launcher kills stale app processes safely and deterministically
- [ ] Make launcher print explicit health for DB, backend, frontend, `MOBILE_FAST`, and `MOBILE_PHOTO`
- [ ] Remove stale fallback behavior that causes hidden misrouting
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 2: Security Hardening for Production

### 2.1 Security Headers and Browser Hardening
- [ ] Add Content Security Policy
- [ ] Add HSTS for secure deployments
- [ ] Add `X-Content-Type-Options: nosniff`
- [ ] Add frame protection policy
- [ ] Add referrer policy
- [ ] Review browser permission prompts and fallback messaging
- [ ] Testing
- [ ] Testing report: 0/0

### 2.2 Audit Logging and Sensitive Action Traceability
- [ ] Add audit log model/table for security-sensitive actions
- [ ] Log password resets
- [ ] Log contractor assignment changes
- [ ] Log system setting changes
- [ ] Log notification credential changes
- [ ] Log plan deletion and drawing deletion actions
- [ ] Add UI or admin access path for viewing audit entries later
- [ ] Testing
- [ ] Testing report: 0/0

### 2.3 Backup, Recovery, and Resilience
- [ ] Define DB backup strategy
- [ ] Define uploads backup strategy
- [ ] Define restore procedure
- [ ] Add backup verification checklist
- [ ] Document disaster recovery steps
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 3: Canvas Performance and Smoothness

### 3.1 Immediate Performance Wins
- [ ] Throttle pointer move updates with `requestAnimationFrame`
- [ ] Throttle touch move updates with `requestAnimationFrame`
- [ ] Reduce React state updates during drag/pan/zoom
- [ ] Move transient interaction state into refs where suitable
- [ ] Reduce `getImageData()` calls during live interaction
- [ ] Prevent background thumbnail/render work from competing with active interaction
- [ ] Testing
- [ ] Testing report: 0/0

### 3.2 Canvas Rendering Architecture
- [ ] Split canvas rendering into base drawing layer, annotation layer, and interaction layer
- [ ] Avoid full redraw when only transient overlays change
- [ ] Cache rendered page bitmap by page and zoom state where practical
- [ ] Reduce unnecessary PDF rerendering
- [ ] Review image page rendering path for redundant redraws
- [ ] Testing
- [ ] Testing report: 0/0

### 3.3 Hit Testing and Geometry Optimization
- [ ] Add spatial indexing for drawing elements
- [ ] Optimize single-select hit testing
- [ ] Optimize multi-select / selection-box hit testing
- [ ] Reduce geometry scan cost on large pages
- [ ] Review copy/move/update flows for unnecessary full-page reloads
- [ ] Testing
- [ ] Testing report: 0/0

### 3.4 Mobile Canvas Optimization
- [ ] Reduce touch interaction lag on phones
- [ ] Simplify expensive visual effects on small screens
- [ ] Optimize touch magnifier rendering
- [ ] Optimize gesture conflict resolution
- [ ] Ensure mobile-specific overlays do not block interaction or scrolling
- [ ] Testing
- [ ] Testing report: 0/0

### 3.5 Background Work and Worker Offload
- [ ] Identify geometry-heavy work suitable for Web Worker offload
- [ ] Move expensive non-UI calculations off the main thread
- [ ] Review PDF thumbnail generation scheduling
- [ ] Add cancellation policy for long-running background tasks
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 4: Quality Assurance and Release Discipline

### 4.1 Core Flow Regression Coverage
- [ ] Add regression coverage for login/logout
- [ ] Add regression coverage for hierarchy ownership separation
- [ ] Add regression coverage for contractor scoping
- [ ] Add regression coverage for progress submission
- [ ] Add regression coverage for notification scheduling
- [ ] Add regression coverage for presentation flow
- [ ] Testing
- [ ] Testing report: 0/0

### 4.2 Canvas and Device Regression Coverage
- [ ] Add regression coverage for desktop canvas selection/drawing
- [ ] Add regression coverage for touch canvas selection/drawing
- [ ] Add regression coverage for mobile progress capture flow
- [ ] Add regression coverage for media preview flow
- [ ] Add regression coverage for time-scale interactions in structure cards
- [ ] Testing
- [ ] Testing report: 0/0

### 4.3 Performance and Reliability Validation
- [ ] Define acceptable performance targets for desktop canvas
- [ ] Define acceptable performance targets for mobile canvas
- [ ] Measure page render times
- [ ] Measure interaction latency
- [ ] Measure load times for dashboard, plans, and presentation
- [ ] Add release checklist for performance acceptance
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 5: Governance, Review, and Traceability Features

### 5.1 Approval Workflow
- [ ] Design contractor submission and monitor approval workflow
- [ ] Add approve/reject decision states
- [ ] Add review remarks trail
- [ ] Add dashboard visibility for pending approvals
- [ ] Testing
- [ ] Testing report: 0/0

### 5.2 Revision History
- [ ] Add plan rename history
- [ ] Add page rename history
- [ ] Add annotation change history
- [ ] Add element schedule change history
- [ ] Add rollback design for selected change types
- [ ] Testing
- [ ] Testing report: 0/0

### 5.3 Evidence Integrity
- [ ] Define media hash strategy
- [ ] Store integrity metadata for uploaded evidence
- [ ] Review tamper-evidence requirements
- [ ] Add capture metadata validation policy
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 6: Reporting and Enterprise Visibility

### 6.1 Operational Reports
- [ ] Daily curing compliance report
- [ ] Missed update report
- [ ] Contractor performance report
- [ ] Monitor activity report
- [ ] Structure-level summary report
- [ ] Testing
- [ ] Testing report: 0/0

### 6.2 Dashboard Analytics
- [ ] Add stronger summary analytics for monitor admins
- [ ] Add stronger summary analytics for superadmin
- [ ] Add trend charts for curing compliance
- [ ] Add contractor response trends
- [ ] Add overdue and at-risk structure visibility
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 7: Feature Improvement and Value Expansion

### 7.1 Bulk Productivity Tools
- [ ] Bulk schedule updates for elements
- [ ] Bulk type/color/property updates
- [ ] Bulk hide/show tools
- [ ] Bulk copy/move refinement
- [ ] Testing
- [ ] Testing report: 0/0

### 7.2 Notification and Escalation Engine
- [ ] Add escalation rules for missed progress
- [ ] Add reminder retry logic
- [ ] Add channel fallback logic
- [ ] Add notification reporting and delivery diagnostics
- [ ] Testing
- [ ] Testing report: 0/0

### 7.3 Plan Intelligence
- [ ] Improve PDF/DXF parsing pipeline
- [ ] Add OCR-assisted metadata extraction where useful
- [ ] Add smarter page/grid recognition
- [ ] Add optional element suggestion tooling
- [ ] Testing
- [ ] Testing report: 0/0

### 7.4 Enterprise Capability Expansion
- [ ] Evaluate SSO support
- [ ] Evaluate object storage support
- [ ] Evaluate signed URL delivery
- [ ] Evaluate role refinement beyond current 3-role model
- [ ] Evaluate retention policy controls
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 8: Mobile and Field Excellence

### 8.1 Offline and Sync Strategy
- [ ] Design offline-first progress capture
- [ ] Design queued media sync
- [ ] Design conflict handling for delayed uploads
- [ ] Add user feedback for pending sync state
- [ ] Testing
- [ ] Testing report: 0/0

### 8.2 Mobile Field UX Refinement
- [ ] Improve small-screen interaction targets
- [ ] Improve mobile drawer and table behaviors
- [ ] Improve mobile presentation navigation
- [ ] Improve field capture reliability across Android/iOS
- [ ] Review all critical flows under unstable network conditions
- [ ] Testing
- [ ] Testing report: 0/0

---

## Phase 9: Final Industrial Readiness Gate

### 9.1 Security Gate
- [ ] Confirm secret management is production-safe
- [ ] Confirm docs/openapi production exposure is closed
- [ ] Confirm upload pipeline is hardened
- [ ] Confirm auth and rate limiting are active
- [ ] Confirm audit logging is active
- [ ] Testing
- [ ] Testing report: 0/0

### 9.2 Performance Gate
- [ ] Confirm desktop canvas meets target
- [ ] Confirm mobile canvas meets target
- [ ] Confirm presentation performance is acceptable
- [ ] Confirm launch/startup reliability is acceptable
- [ ] Testing
- [ ] Testing report: 0/0

### 9.3 Release Gate
- [ ] Confirm backup/restore workflow
- [ ] Confirm environment separation
- [ ] Confirm monitoring and error reporting
- [ ] Confirm documentation for operations and deployment
- [ ] Final acceptance review
- [ ] Testing
- [ ] Testing report: 0/0

