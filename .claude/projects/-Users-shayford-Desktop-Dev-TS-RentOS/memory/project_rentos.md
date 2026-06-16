---
name: RentOS Ghana Platform
description: RentOS is a comprehensive rental property management and tenant protection platform for Ghana — monorepo with client (React/Vite), server (Express/MongoDB), mobile, and shared types
type: project
---

RentOS is a Ghana-focused rental management platform with a monorepo structure:
- **client/** — React + Vite + TailwindCSS + MUI + TanStack Query
- **server/** — Express 5 + MongoDB (Mongoose) + TypeScript
- **shared/** — Shared TypeScript types used by both client and server
- **mobile/** — React Native (Expo)

**Why:** Addresses Ghana-specific rental challenges including tenant protection, rent advance limits, mobile money payments (MTN MoMo, Telecel Cash, AirtelTigo Money), and compliance with Ghanaian rental law.

**How to apply:** When working on features, ensure shared types stay in sync between client/server. The platform serves multiple roles (tenant, landlord, property_manager, government, legal_officer, admin) — always consider role-based access when modifying endpoints or UI.

Key modules: Properties, Agreements, Payments, Savings/Wallet, Investments, Loans, Disputes, Credit Scoring, Tenant Profiles, Profile Access Control, Reviews, Chat/Messaging, Documents, Blog, Legal Articles, AI Assistant, Policy Simulation, Push Notifications, Analytics.
