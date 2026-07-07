export interface Department {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

export interface Personnel {
  id: string;
  auth_id: string;
  department_id: string;
  full_name: string;
  email: string;
  role: "admin" | "supervisor" | "personel";
  status: string;
  departments: Department | null;
}

export interface Shift {
  id: string;
  department_id: string;
  name: string;
  start_time: string;
  end_time: string;
}

export interface Patrol {
  id: string;
  department_id: string;
  personnel_id: string;
  route_name: string;
  status: "active" | "paused" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  total_checkpoints: number;
  completed_checkpoints: number;
  duration_seconds: number | null;
}

export interface PatrolCheckpoint {
  id: string;
  patrol_id: string;
  checkpoint_order: number;
  name: string;
  status: "pending" | "active" | "completed";
  scanned_at: string | null;
  qr_token?: string | null;
  detail?: string | null;
}

export interface Incident {
  id: string;
  department_id: string;
  reported_by: string;
  type: string;
  severity: string;
  title: string | null;
  description: string;
  location: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: string;
  reporter?: { full_name: string };
  departments?: Department;
}

export interface Request {
  id: string;
  personnel_id: string;
  department_id: string;
  type: string;
  details: string;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned?: { full_name: string } | null;
}

export interface PatrolAssignment {
  id: string;
  personnel_id: string;
  route_id: string;
  date: string;
  scheduled_time: string;
  status: "pending" | "active" | "completed" | "missed";
  patrol_id: string | null;
  created_at: string;
}

export interface Communication {
  id: string;
  type: "duyuru" | "gorev" | "talimat";
  priority: "normal" | "urgent";
  title: string;
  content: string;
  target_type: "all" | "location";
  location_id: string | null;
  department_id: string;
  created_by: string;
  expires_at: string | null;
  created_at: string;
  creator?: { full_name: string } | null;
  location?: { name: string } | null;
  read_count?: number;
  total_target?: number;
}

export interface CommunicationRead {
  id: string;
  communication_id: string;
  personnel_id: string;
  read_at: string;
}

export interface CleaningArea {
  id: string;
  location_id: string;
  name: string;
  requires_photo: boolean;
  sort_order: number;
}

export interface CleaningProgram {
  id: string;
  department_id: string;
  location_id: string;
  personnel_id: string | null;
  recurrence_type: "daily" | "weekly";
  days_of_week: number[] | null;
  shift_code: string | null;
  active: boolean;
  created_at: string;
}

export interface CleaningChecklist {
  id: string;
  program_id: string | null;
  department_id: string;
  location_id: string;
  personnel_id: string | null;
  date: string;
  created_at: string;
}

export interface CleaningChecklistItem {
  id: string;
  checklist_id: string;
  area_id: string;
  status: "tamamlandı" | "devam_ediyor" | "tamamlanmadı" | "atlandı";
  photo_url: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface EmergencyAlert {
  id: string;
  department_id: string;
  personnel_id: string;
  location_id: string | null;
  status: "active" | "acknowledged" | "closed";
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  closed_at: string | null;
  personnel?: { full_name: string } | null;
  location?: { name: string } | null;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  creator?: { full_name: string } | null;
}
