# RunLoyal Admin Portal — Frontend

The administrative portal for the **RunLoyal Multi-Tenant Service, Staff Availability & Booking Platform**. Built with React 18, TypeScript, Vite 5, TanStack Query v5, and Okta OIDC.

---

## Features

### 1. Services Calendar (Primary Dashboard)
- **Week View**: 7-day responsive grid (Monday–Sunday) with 30-minute intervals displaying:
  - **Available Slots** (green tint): Calculated from staff working hours minus existing bookings.
  - **Booked Appointments** (indigo tint): Customer and pet name, assigned staff, service, duration.
  - **Staff Breaks** (amber tint): Configured break periods.
  - **Staff Days Off** (slate tint): Scheduled full-day offs.
- **Day View**: Detailed column-by-staff timeline breakdown for a single day.
- **Filtering & Navigation**: Previous/Next week, Today reset, Service filter, and Staff filter.
- **Interactive Booking**: Click any available slot to prefill and launch the booking modal; click any booking to view details or cancel.

### 2. Booking Workflow
- **Creation Modal**:
  - Preselects or selects Service and Start At time (UTC).
  - Dynamic Staff lookup: queries `/api/services/{service}/available-staff?startAt=` in real time to only show staff eligible and available for that exact slot.
  - Form validation with Zod and React Hook Form (Customer Name required, Pet Name optional).
  - **409 Conflict Handling**: Gracefully catches double-booking conflicts and prompts the user without losing form state.
- **Detail & Cancellation**:
  - Displays complete booking snapshot (customer, pet, service, provider, times in UTC).
  - One-click cancellation with a confirmation dialog, immediately freeing the slot in the calendar.

### 3. Services Management
- Full CRUD interface for multi-tenant services.
- Manage Name, Category, Duration (minutes), Price, and Status (`ACTIVE` / `INACTIVE`).
- Detail page showing assigned staff providers.

### 4. Staff & Availability Management
- Create and edit staff members.
- **Service Assignment Matrix**: Checkbox list to assign or unassign staff to services (`POST/DELETE /api/services/{service}/staff/{staff}`).
- **Weekly Recurring Availability Schedules**:
  - Configure `WORKING`, `BREAK`, and `OFF` windows per day of week.
  - Inline validation ensuring end time follows start time.

### 5. Multi-Tenant Authentication (Okta OIDC)
- PKCE flow using `@okta/okta-auth-js` and `@okta/okta-react`.
- Protected routes redirect unauthenticated users to Okta login.
- Access token automatically attached as a `Bearer` token to all backend API requests.
- Session expiry listener handles 401 responses and triggers re-authentication.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Bundler & Tooling | Vite 5 |
| UI Library | React 18 + TypeScript |
| Routing | React Router v6 |
| Server State & Caching | TanStack Query v5 |
| Form Validation | React Hook Form + Zod |
| Authentication | Okta OIDC (PKCE Flow) |
| Icons | Lucide React |
| Notifications | React Hot Toast |
| Styling | Custom CSS Design System (Design tokens, Dark SaaS aesthetic) |
| Testing | Vitest + React Testing Library + JSDOM |

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm 9+
- Backend running on `http://localhost:8080` (or configured via proxy)

### Installation
```bash
cd frontend
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your Okta credentials:
```env
VITE_OKTA_ISSUER_URI=https://{yourOktaDomain}/oauth2/default
VITE_OKTA_CLIENT_ID={your-spa-client-id}
VITE_OKTA_AUDIENCE=api://default
VITE_API_BASE_URL=http://localhost:8080
```

### Development Server
```bash
npm run dev
```
Starts the Vite development server with Hot Module Replacement (HMR) and API proxying at `http://localhost:5173`.

---

## Verification & Testing

### Run All Tests
```bash
npm run test
```
Executes 21 unit and integration tests across 8 test suites covering:
- Protected route authentication & redirection
- Service form validation & server errors
- Staff service assignments
- Availability window configuration & time validation
- Calendar week view rendering & slot clicks
- Booking creation workflow & dynamic available staff lookup
- HTTP 409 conflict handling
- Booking cancellation flow with confirmation

### Type Checking & Production Build
```bash
npm run build
```
Runs `tsc --noEmit` followed by the Vite production build.

### Linting
```bash
npm run lint
```
Runs ESLint with TypeScript and React Hooks rules with zero errors and warnings.
