use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use futures_util::{SinkExt, StreamExt};

// Priority level for queue ordering
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Priority {
    Regular,
    Urgent,
}

// Single patient in the queue
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct QueueItem {
    pub token: i32,
    pub priority: Priority,
}

// 5-second safety buffer before committing a token advance
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BufferState {
    pub is_locked: bool,
    pub seconds_remaining: u32,
    pub pending_token: Option<i32>,
}

impl Default for BufferState {
    fn default() -> Self {
        Self {
            is_locked: false,
            seconds_remaining: 0,
            pending_token: None,
        }
    }
}

// Full clinic state, broadcast to all clients on every change
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClinicState {
    pub current_token: i32,
    pub active_consultation_start: Option<String>,
    pub estimated_wait_time_secs: i64,
    pub average_consultation_secs: i64,
    pub upcoming_queue: Vec<QueueItem>,
    pub buffer_state: BufferState,
    pub total_served: i32,
}

// Server-side shared state
pub struct AppState {
    pub clinic_state: RwLock<ClinicState>,
    pub history: RwLock<Vec<i64>>,
    pub cancel_tx: RwLock<Option<tokio::sync::oneshot::Sender<()>>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub next_token_counter: AtomicI32,
}

// Commands received from the receptionist over WebSocket
#[derive(Deserialize, Debug)]
#[serde(tag = "action")]
enum ClientCommand {
    StageNextToken,
    CancelNextToken,
    AddPatient { priority: Priority },
    RemovePatient { token: i32 },
    SetConsultationTime { seconds: i64 },
}

impl AppState {
    // Rolling average of last 5 consultations, excludes outliers (>3x or <x/3 of mean)
    fn calculate_rolling_average(history: &[i64]) -> i64 {
        if history.is_empty() {
            return 600;
        }

        let k = history.len().min(5);
        let recent = &history[history.len() - k..];

        let initial_mu = recent.iter().sum::<i64>() / k as i64;
        if initial_mu == 0 {
            return 600;
        }

        let valid_durations: Vec<i64> = recent
            .iter()
            .cloned()
            .filter(|&d| {
                let d_f = d as f64;
                let mu_f = initial_mu as f64;
                d_f <= 3.0 * mu_f && d_f >= mu_f / 3.0
            })
            .collect();

        if valid_durations.is_empty() {
            return initial_mu;
        }

        valid_durations.iter().sum::<i64>() / valid_durations.len() as i64
    }

    // Recalculates estimated wait: queue_length × avg_consultation
    fn recalculate_wait(clinic_state: &mut ClinicState) {
        let p_ahead = clinic_state.upcoming_queue.len() as i64;
        clinic_state.estimated_wait_time_secs = p_ahead * clinic_state.average_consultation_secs;
    }

    // Serializes current state and pushes to all connected WebSocket clients
    async fn broadcast_state(&self) {
        let state = self.clinic_state.read().await.clone();
        if let Ok(payload) = serde_json::to_string(&state) {
            let _ = self.broadcast_tx.send(payload);
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let (tx, _rx) = broadcast::channel::<String>(100);

    let initial_state = ClinicState {
        current_token: 0,
        active_consultation_start: None,
        estimated_wait_time_secs: 0,
        average_consultation_secs: 600,
        upcoming_queue: Vec::new(),
        buffer_state: BufferState::default(),
        total_served: 0,
    };

    let shared_state = Arc::new(AppState {
        clinic_state: RwLock::new(initial_state),
        history: RwLock::new(Vec::new()),
        cancel_tx: RwLock::new(None),
        broadcast_tx: tx,
        next_token_counter: AtomicI32::new(1),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/state", get(get_state))
        .route("/api/ws", get(websocket_handler))
        .layer(cors)
        .with_state(shared_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("Queue Cure '26 Backend listening on http://0.0.0.0:8080");
    axum::serve(listener, app).await.unwrap();
}

// GET /api/state — returns current clinic state as JSON
async fn get_state(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let state_guard = state.clinic_state.read().await;
    (StatusCode::OK, axum::Json(state_guard.clone()))
}

// GET /api/ws — upgrades to WebSocket
async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

// Manages a single WebSocket connection: sends state updates, receives commands
async fn handle_ws_connection(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.broadcast_tx.subscribe();

    // Send initial state on connect
    {
        let current_state = state.clinic_state.read().await.clone();
        if let Ok(payload) = serde_json::to_string(&current_state) {
            let _ = sender.send(Message::Text(payload)).await;
        }
    }

    // Forward broadcast updates to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(payload) = rx.recv().await {
            if sender.send(Message::Text(payload)).await.is_err() {
                break;
            }
        }
    });

    // Process incoming commands from this client
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(cmd) = serde_json::from_str::<ClientCommand>(&text) {
                    match cmd {
                        ClientCommand::StageNextToken => stage_next_token(&state).await,
                        ClientCommand::CancelNextToken => cancel_next_token(&state).await,
                        ClientCommand::AddPatient { priority } => add_patient(&state, priority).await,
                        ClientCommand::RemovePatient { token } => remove_patient(&state, token).await,
                        ClientCommand::SetConsultationTime { seconds } => set_consultation_time(&state, seconds).await,
                    }
                }
            }
        }
    });

    // Abort both tasks if either side disconnects
    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); },
        _ = &mut recv_task => { send_task.abort(); }
    }
}

// Adds a patient. Urgent patients insert after existing urgents but before regulars.
async fn add_patient(state: &Arc<AppState>, priority: Priority) {
    let token = state.next_token_counter.fetch_add(1, Ordering::SeqCst);

    let mut clinic_state = state.clinic_state.write().await;
    let item = QueueItem { token, priority };

    match &item.priority {
        Priority::Urgent => {
            let insert_pos = clinic_state
                .upcoming_queue
                .iter()
                .position(|q| matches!(q.priority, Priority::Regular))
                .unwrap_or(clinic_state.upcoming_queue.len());
            clinic_state.upcoming_queue.insert(insert_pos, item);
        }
        Priority::Regular => {
            clinic_state.upcoming_queue.push(item);
        }
    }

    AppState::recalculate_wait(&mut clinic_state);
    drop(clinic_state);
    state.broadcast_state().await;
}

// Removes a patient by token. Blocks removal of a token currently being staged.
async fn remove_patient(state: &Arc<AppState>, token: i32) {
    let mut clinic_state = state.clinic_state.write().await;

    if clinic_state.buffer_state.is_locked && clinic_state.buffer_state.pending_token == Some(token) {
        return;
    }

    if let Some(pos) = clinic_state.upcoming_queue.iter().position(|q| q.token == token) {
        clinic_state.upcoming_queue.remove(pos);
        AppState::recalculate_wait(&mut clinic_state);
    }

    drop(clinic_state);
    state.broadcast_state().await;
}

// Overrides average consultation time and clears history for a fresh baseline
async fn set_consultation_time(state: &Arc<AppState>, seconds: i64) {
    let clamped = seconds.clamp(60, 3600);

    {
        let mut clinic_state = state.clinic_state.write().await;
        clinic_state.average_consultation_secs = clamped;
        AppState::recalculate_wait(&mut clinic_state);
    }

    {
        let mut history = state.history.write().await;
        history.clear();
    }

    state.broadcast_state().await;
}

// Locks buffer, caches target token, starts a 5-second countdown before auto-commit
async fn stage_next_token(state: &Arc<AppState>) {
    let mut clinic_state = state.clinic_state.write().await;

    if clinic_state.buffer_state.is_locked {
        return;
    }

    if clinic_state.upcoming_queue.is_empty() {
        return;
    }

    let pending_token = clinic_state.upcoming_queue[0].token;
    clinic_state.buffer_state = BufferState {
        is_locked: true,
        seconds_remaining: 5,
        pending_token: Some(pending_token),
    };

    drop(clinic_state);
    state.broadcast_state().await;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut cancel_guard = state.cancel_tx.write().await;
        *cancel_guard = Some(tx);
    }

    // 5-second countdown with per-second broadcast and cancellation support
    let state_clone = Arc::clone(state);
    tokio::spawn(async move {
        let mut rx = std::pin::pin!(rx);
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        interval.tick().await;

        for i in (1..=5).rev() {
            {
                let mut clinic_state = state_clone.clinic_state.write().await;
                if !clinic_state.buffer_state.is_locked {
                    return;
                }
                clinic_state.buffer_state.seconds_remaining = i;
            }
            state_clone.broadcast_state().await;

            tokio::select! {
                _ = &mut rx => {
                    return;
                }
                _ = interval.tick() => {
                    if i == 1 {
                        commit_next_token(&state_clone).await;
                        return;
                    }
                }
            }
        }
    });
}

// Aborts the staging countdown and resets buffer state
async fn cancel_next_token(state: &Arc<AppState>) {
    {
        let mut cancel_guard = state.cancel_tx.write().await;
        if let Some(tx) = cancel_guard.take() {
            let _ = tx.send(());
        }
    }

    {
        let mut clinic_state = state.clinic_state.write().await;
        clinic_state.buffer_state = BufferState::default();
    }
    state.broadcast_state().await;
}

// Finalizes token advance: records consultation duration, updates rolling average, promotes token
async fn commit_next_token(state: &Arc<AppState>) {
    let mut clinic_state = state.clinic_state.write().await;

    // Record previous consultation duration and update rolling average
    if let Some(prev_start_str) = &clinic_state.active_consultation_start {
        if let Ok(prev_start) = chrono::DateTime::parse_from_rfc3339(prev_start_str) {
            let delta = Utc::now()
                .signed_duration_since(prev_start.with_timezone(&Utc))
                .num_seconds()
                .max(0);

            let mut history = state.history.write().await;
            history.push(delta);
            if history.len() > 5 {
                history.remove(0);
            }

            let new_mu = AppState::calculate_rolling_average(&history);
            clinic_state.average_consultation_secs = new_mu;
        }
    }

    // Promote pending token to current
    if let Some(pending_token) = clinic_state.buffer_state.pending_token {
        clinic_state.current_token = pending_token;
        clinic_state.active_consultation_start = Some(Utc::now().to_rfc3339());

        if !clinic_state.upcoming_queue.is_empty() {
            clinic_state.upcoming_queue.remove(0);
        }

        clinic_state.total_served += 1;
        AppState::recalculate_wait(&mut clinic_state);
    }

    // Reset buffer and cancellation channel
    clinic_state.buffer_state = BufferState::default();
    *state.cancel_tx.write().await = None;

    drop(clinic_state);
    state.broadcast_state().await;
}