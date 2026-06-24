# Socket Event Diagram

This document outlines the real-time communication flow over WebSockets between the **Receptionist Panel**, the **Backend Server**, and the **Patient Display**.

---

## Architecture Flow

```mermaid
sequenceDiagram
    participant R as Receptionist Panel
    participant S as Server (Axum + Tokio)
    participant P as Patient Display

    Note over S: Stores global ClinicState in RwLock
    
    %% Initial Connection
    R->>S: WS Connect (`/api/ws`)
    S-->>R: Push Initial `ClinicState` (JSON)
    P->>S: WS Connect (`/api/ws`)
    S-->>P: Push Initial `ClinicState` (JSON)

    %% Action: Add Patient
    R->>S: Send Command: `{"action": "AddPatient", "priority": "Urgent"}`
    Note over S: Generate Token (AtomicI32)<br/>Insert into Priority Queue<br/>Recalculate Estimated Wait
    S-->>R: Broadcast updated `ClinicState`
    S-->>P: Broadcast updated `ClinicState`

    %% Action: Stage Next Token (Call Next)
    R->>S: Send Command: `{"action": "StageNextToken"}`
    Note over S: Lock Buffer State<br/>Start 5-second countdown
    loop Every Second (for 5s)
        S-->>R: Broadcast `ClinicState` (Countdown Update)
        S-->>P: Broadcast `ClinicState` (Countdown Update)
    end
    
    %% Action: Commit Token (Auto after 5s)
    Note over S: Timer reaches 0
    Note over S: Promote pending token to Current<br/>Update Consultation Avg Time
    S-->>R: Broadcast final `ClinicState` (Token Served!)
    S-->>P: Broadcast final `ClinicState` (Token Served!)

    %% Action: Set Manual Consultation Time
    R->>S: Send Command: `{"action": "SetConsultationTime", "seconds": 600}`
    Note over S: Update global Avg Time<br/>Recalculate Wait<br/>Clear Rolling History
    S-->>R: Broadcast updated `ClinicState`
    S-->>P: Broadcast updated `ClinicState`
```

---

## Command Payloads (Client -> Server)

When an action is triggered on the Receptionist Panel, a command payload is sent over the WebSocket channel:

| Command Action | Description | Payload Schema |
| :--- | :--- | :--- |
| **AddPatient** | Enqueues a new patient | `{"action": "AddPatient", "priority": "Regular" \| "Urgent"}` |
| **RemovePatient** | Dequeues a patient | `{"action": "RemovePatient", "token": 12}` |
| **StageNextToken** | Locks buffer and starts 5s countdown | `{"action": "StageNextToken"}` |
| **CancelNextToken** | Cancels the staging buffer countdown | `{"action": "CancelNextToken"}` |
| **SetConsultationTime** | Sets manual consultation time override | `{"action": "SetConsultationTime", "seconds": 900}` |

---

## State Payload (Server -> Client)

Every time the state changes (via receptionist command or buffer countdown tick), the server broadcasts the full updated `ClinicState` JSON object to all clients:

```json
{
  "current_token": 12,
  "active_consultation_start": "2026-06-24T14:30:00Z",
  "estimated_wait_time_secs": 1800,
  "average_consultation_secs": 600,
  "upcoming_queue": [
    { "token": 13, "priority": "Urgent" },
    { "token": 14, "priority": "Regular" }
  ],
  "buffer_state": {
    "is_locked": false,
    "seconds_remaining": 0,
    "pending_token": null
  },
  "total_served": 11
}
```
