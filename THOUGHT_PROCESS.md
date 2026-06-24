# Thought Process & Architecture Decisions

This document outlines the design decisions and architectural choices made while building this project for **Queue Cure '26**. The goal was to build a system that is fast, resilient, and easy to understand, while effectively solving the problems of queues and waiting anxiety that patients face in Indian clinics.

---

## Problem Statement

**76% of India's 1.5 million clinics still rely on paper tokens.** Patients wait for hours without knowing when they will be called. Receptionists are overwhelmed managing the queue from memory, leading to a frustrating experience for everyone involved.

---

## Key Design Decisions

### 1. Unified State via WebSockets (Real-time Sync)

* **Decision**: Use full-duplex WebSockets instead of resource-intensive REST polling.
* **Why**: In a busy clinic, patients and receptionists must see identical data concurrently. REST polling adds overhead and lag. With Axum and `tokio::sync::broadcast`, the server acts as the single source of truth. The moment a receptionist adds a patient or calls the next token, the server immediately broadcasts the serialized `ClinicState` payload to all connected clients.

### 2. The 5-Second Staging Buffer

* **Decision**: Introduce a 5-second cancelable staging buffer before committing a token advance.
* **Why**: Receptionists work fast, and double-clicking or mistaking a token is common. Instantly popping a token from the queue makes rollbacks messy. A 5-second countdown offers:
    1. **Undo window**: A safety cushion for the receptionist to cancel the action.
    2. **Patient alert**: Visual feedback that a token is "being called," giving the patient time to stand up and prepare.

### 3. Adaptive Wait Time & Live Countdown

* **Decision**: Calculate estimated wait times using a rolling average of the last 5 completed consultations, combined with live client-side countdown tracking.
* **Why**: Static wait times are rarely accurate. A doctor might take 5 minutes for a follow-up but 25 minutes for a new check-up.
  1. **Rolling Average**: We store the last 5 consultation durations. To prevent extreme outliers from skewing the data, we filter out durations that are $>3\times$ or $<1/3\times$ the initial mean.
  2. **Live Clock Integration**: Instead of waiting static minutes, the waiting room display dynamically subtracts elapsed consultation time from the wait window. The countdown ticks down live, providing precise estimated completion times (e.g. `Est: 10:12 AM`) that update second-by-second.

### 4. Priority Queuing

* **Decision**: Implement a split queue design supporting both "Regular" and "Urgent" patients.
* **Why**: Clinics frequently experience emergencies. Urgent patients are automatically sorted to slot *after* existing urgent patients, but *before* all regular patients. This preserves priority order for emergencies without starving regular patients indefinitely.

---

## Tech Stack Justification

* **Rust (Axum + Tokio)**: Chosen for its memory safety, zero-cost abstractions, and high-performance concurrency. Axum makes WebSocket integration seamless, and Tokio handles async timers for the staging buffer cleanly.
* **React 19 + Vite**: Provides a fast, hot-reloading development experience and minimal asset sizes.
* **Tailwind CSS v4**: Utility-first CSS allows for clean, robust UI development. The interfaces utilize curated high-contrast palettes, smooth micro-animations, and responsive designs.
