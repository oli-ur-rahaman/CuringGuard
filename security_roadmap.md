# CuringGuard Security Roadmap

This document outlines the phases and tasks required to secure the CuringGuard platform against various threats (brute force, DDoS, session hijacking) before the final production deployment.

## Phase 1: Authentication & Brute Force Prevention
**Goal:** Prevent unauthorized access and automated credential stuffing.

- [ ] **Task 1.1: Rate Limiting**
  - Install `slowapi`.
  - Apply rate limiting to the `/api/auth/login` endpoint (e.g., max 5 attempts per minute per IP).
- [ ] **Task 1.2: Account Lockout**
  - Add a `failed_login_attempts` and `locked_until` column to the User model.
  - Temporarily lock accounts after 5 consecutive failed attempts.
- [ ] **Task 1.3: Password Complexity Enforcement**
  - Update user creation/password reset Pydantic schemas to require 1 uppercase, 1 number, and 1 special character.

## Phase 2: Session & Token Security
**Goal:** Protect user sessions from XSS and hijacking.

- [ ] **Task 2.1: Implement HTTPOnly Cookies**
  - Refactor the FastAPI backend to issue JWT access and refresh tokens as `HTTPOnly`, `Secure`, and `SameSite` cookies instead of JSON body responses.
  - Refactor the React frontend to rely on these cookies rather than `localStorage`.
- [ ] **Task 2.2: Short-Lived Access Tokens**
  - Reduce Access Token expiration to 15 minutes.
  - Implement a Refresh Token rotation endpoint.

## Phase 3: Infrastructure & DDoS Protection
**Goal:** Protect the server from traffic floods and volumetric attacks.

- [ ] **Task 3.1: Configure WAF/CDN**
  - Set up Cloudflare or AWS WAF in front of the production domain.
  - Enable "Under Attack" mode or strict bot-fighting rules.
- [ ] **Task 3.2: Reverse Proxy Connection Limits**
  - Configure Nginx (or similar) to limit concurrent connections and request rates per IP.
- [ ] **Task 3.3: Pagination Enforcement**
  - Ensure all `GET` endpoints returning arrays use forced pagination to prevent memory exhaustion.

## Phase 4: Application Hardening
**Goal:** General security best practices for web applications.

- [ ] **Task 4.1: Strict CORS Policy**
  - Update `main.py` to only allow the exact production domain (e.g., `https://app.curingguard.com`) instead of `localhost` or `*`.
- [ ] **Task 4.2: Security Headers**
  - Add middleware to inject headers: `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security` (HSTS).
- [ ] **Task 4.3: Hide Server Fingerprints**
  - Remove default FastAPI/Uvicorn server headers.

---
**Usage Note:** 
This roadmap is designed to be executed right before moving from the staging environment to production. During standard local development, implementing these features (especially rate limits and HTTPOnly cookies) can slow down testing, so they are deferred until the pre-deployment phase.
