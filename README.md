# Queue Cure '26

> **Real-time, responsive queue management system built for hospitals and clinics.**
> Solving the problem of long, frustrating waiting room delays with zero visibility by providing live, dynamic token and queue status updates.

This is the official submission for the **Queue Cure '26** Hackathon hosted by Wooble Software Private Limited.

---

## Features

- **Receptionist Dashboard**:
  - Add patients instantly as **Regular** or **Urgent** priority.
  - Call the next patient using a **5-second safety staging buffer** (cancelable to prevent accidental clicks).
  - Override or set average consultation times with a live feedback layout.
- **Patient Waiting Room View**:
  - Displays the current active token prominently.
  - Personal token search lookup showing the count of patients ahead and a live countdown.
  - Dynamic, ticking estimated wait-time and projected completion clock times (e.g. `Est: 10:12 AM`) so patients know exactly when it's their turn.
- **Real-time Synchronization**:
  - Dynamic WebSockets broadcast state updates instantly to all connected displays the moment changes occur without refreshing the page.

---

## Tech Stack

- **Frontend**: `React 19` • `Vite` • `Tailwind CSS v4` • `TypeScript`
- **Backend**: `Rust` • `Axum` • `Tokio` • `WebSockets`

---

## How to Run Locally

### 1. Backend (Rust)

1. Ensure Rust is installed on your machine.
2. Navigate to the `queue-cure-backend` directory.
3. Run the application:

   ```bash
   cargo run
   ```

4. The server will launch on `http://localhost:8080` exposing WS endpoints.

### 2. Frontend (React)

1. Ensure Node.js is installed.
2. Navigate to the `queue-cure-frontend` directory.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open your browser:
   - **Patient Display**: `http://localhost:5173`
   - **Receptionist Panel**: `http://localhost:5173/receptionist`

---

## Documentation Reference

- [Socket Event Diagram](./SOCKET_EVENT_DIAGRAM.md) — Structural sequence of WebSocket communications.
- [Thought Process & Architecture](./THOUGHT_PROCESS.md) — Detailed design decisions and queue math.
