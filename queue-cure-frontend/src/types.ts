export interface QueueItem {
  token: number;
  priority: 'Regular' | 'Urgent';
}

export interface BufferState {
  is_locked: boolean;
  seconds_remaining: number;
  pending_token: number | null;
}

export interface ClinicState {
  current_token: number;
  active_consultation_start: string | null;
  estimated_wait_time_secs: number;
  average_consultation_secs: number;
  upcoming_queue: QueueItem[];
  buffer_state: BufferState;
  total_served: number;
}