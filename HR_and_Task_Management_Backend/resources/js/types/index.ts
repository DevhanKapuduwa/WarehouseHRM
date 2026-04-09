/** Calendar-month aggregates (standard day = 8h). */
export interface MonthlyWorkStat {
    year_month: string;
    total_hours_worked: number;
    overtime_hours: number;
    shortage_minutes: number;
    /** Full 8h equivalents from cumulative shortage minutes in that month */
    absenteeism_units: number;
    /** Leftover shortage below one full 8h unit (hours, one decimal) */
    shortage_hours_remainder: number;
}

export interface EmployeeProfileMetrics {
    tenure: { total_days: number; label: string } | null;
    projects_completed: number;
    /** Overtime this calendar month (hours beyond 8h per day). */
    overtime_hours: number;
    /** Derived from unapproved absence + lateness vs shift; 8h shortage = 1 unit (this month). */
    absenteeism_units: number;
    /** This month: shortage minutes not yet forming a full absenteeism unit (hours). */
    shortage_hours_remainder: number;
    total_hours_worked_this_month: number;
    /** Mean of each month’s `total_hours_worked` from first activity through current month. */
    average_monthly_hours_worked: number;
    monthly_work_stats?: MonthlyWorkStat[];
    /** Present ÷ (present + absent) across engagement events, 0–100; null if never marked */
    engagement_attendance_pct: number | null;
    /** Derived from engagement_attendance_pct */
    work_life_balance: 'Poor' | 'Average' | 'Good' | 'Excellent' | null;
}

export interface User {
    id: number;
    name: string;
    email: string;
    role: 'management' | 'worker' | 'supervisor' | 'hr';
    employee_id: string;
    department: string;
    phone: string;
    is_active: boolean;
    avatar?: string;
    tasks_count?: number;
    created_at: string;
    updated_at?: string;
    /** Self-reported (worker) */
    age?: number | null;
    gender?: string | null;
    education_level?: string | null;
    marital_status?: string | null;
    joined_date?: string | null;
    /** Manager-maintained */
    job_role?: string | null;
    salary?: string | number | null;
    work_location?: string | null;
    training_hours?: number | null;
    promotions?: number | null;
    absenteeism?: number | null;
    distance_from_home?: number | null;
    manager_feedback_score?: string | number | null;
    /** Management-only: 1–5 */
    performance_rating?: number | null;
    profile_metrics?: EmployeeProfileMetrics;
}

export type ManagerProfileFields = Pick<User,
    | 'job_role'
    | 'department'
    | 'salary'
    | 'work_location'
    | 'training_hours'
    | 'promotions'
    | 'absenteeism'
    | 'distance_from_home'
    | 'manager_feedback_score'
    | 'performance_rating'
>;

export type WorkerSelfProfileFields = Pick<User,
    'age' | 'gender' | 'education_level' | 'marital_status' | 'joined_date'
>;

export interface LeaveType {
    id: number;
    name: string;
    code: string;
    is_paid: boolean;
    requires_attachment: boolean;
    is_active: boolean;
    approval_chain_roles: Array<'supervisor' | 'hr' | 'management'>;
    yearly_entitlement_hours: number;
    min_notice_hours: number;
    max_consecutive_hours: number | null;
    created_at: string;
    updated_at: string;
}

// Enum-style codes for default seeded types
export type LeaveTypeCode = 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID';

export interface LeaveRequest {
    id: number;
    user_id: number;
    leave_type_id: number;
    start_at: string;
    end_at: string;
    duration_hours: number;
    reason: string | null;
    attachment_path: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    current_step: number;
    submitted_at: string | null;
    decision_at: string | null;
    leave_type?: LeaveType;
    leaveType?: LeaveType;
    user?: Pick<User, 'id' | 'name' | 'employee_id' | 'department'>;
    approvals?: LeaveApproval[];
    created_at: string;
    updated_at: string;
}

export interface LeaveApproval {
    id: number;
    leave_request_id: number;
    step_index: number;
    required_role: 'supervisor' | 'hr' | 'management';
    acted_by: number | null;
    action: 'approved' | 'rejected' | null;
    comment: string | null;
    acted_at: string | null;
    actor?: Pick<User, 'id' | 'name'>;
    created_at: string;
    updated_at: string;
}

export interface LeaveBalance {
    id: number;
    user_id: number;
    leave_type_id: number;
    year: number;
    entitled_hours: number;
    used_hours: number;
    leaveType?: LeaveType;
    leave_type?: LeaveType;
    created_at: string;
    updated_at: string;
}

export interface TaskCompletionPhoto {
    id: number;
    task_id: number;
    photo_path: string;
    photo_url: string;
    created_at: string;
    updated_at: string;
}

export interface Task {
    id: number;
    title: string;
    description: string;
    assigned_to: number;
    assigned_by: number;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'pending_approval';
    priority: 'low' | 'medium' | 'high';
    has_subtasks: boolean;
    parent_id: number | null;
    location: string | null;
    location_text?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    place_id?: string | null;
    place_name?: string | null;
    place_address?: string | null;
    due_date: string | null;
    approval_notes: string | null;
    worker?: User;
    manager?: User;
    parent?: Pick<Task, 'id' | 'title'>;
    subtasks?: Task[];
    completion_photos?: TaskCompletionPhoto[];
    created_at: string;
    updated_at: string;
}

export interface TimeLog {
    id: number;
    user_id: number;
    task_id?: number;
    clock_in: string;
    clock_out?: string;
    duration_minutes?: number;
    notes?: string;
    user?: User;
    task?: Task;
    created_at?: string;
}

export interface FaceDetectionLog {
    timestamp: string;
    identifier: string;
    similarity: number;
    camera: string;
}

export interface FaceDetectionLogGroup {
    worker: Pick<User, 'id' | 'name' | 'employee_id'>;
    logs: FaceDetectionLog[];
}

export interface FaceLiveStreamStatus {
    running: boolean;
    pid: number | null;
    stream_url: string;
    step7_properties: {
        resolution: string;
        fps: number;
        yolo_model: string;
        yolo_confidence: number;
        cooldown_seconds: number;
        camera_source: string;
    };
    note: string;
}

export interface Shift {
    id: number;
    user_id: number;
    shift_name: string;
    start_time: string;
    end_time: string;
    date: string;
    user?: User;
}

export interface Announcement {
    id: number;
    title: string;
    body: string;
    target: 'all' | 'workers' | 'management';
    created_by: number;
    creator?: User;
    created_at: string;
}

export interface DashboardStats {
    total_workers: number;
    active_workers: number;
    pending_tasks: number;
    in_progress: number;
    completed_today: number;
    clocked_in_now: number;
    recent_tasks: Task[];
    announcements: Announcement[];
}

export interface WorkerDashboard {
    pending_tasks: number;
    in_progress: number;
    completed_today: number;
    pending_approval: number;
    hours_this_week: number;
    is_clocked_in: boolean;
    todays_shift: Shift | null;
}

export interface MyHoursResponse {
    logs: TimeLog[];
    week_hours: number;
    month_hours: number;
}

export interface EngagementEvent {
    id: number;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    location_text: string | null;
    location_lat: number | null;
    location_lng: number | null;
    created_by: number;
    creator?: Pick<User, 'id' | 'name'>;
    present_count?: number;
    absent_count?: number;
    created_at: string;
    updated_at: string;
}

export interface EngagementAttendance {
    id: number;
    event_id: number;
    user_id: number;
    status: 'present' | 'absent';
    note: string | null;
    marked_by: number;
    marked_at: string;
    user?: Pick<User, 'id' | 'name' | 'employee_id' | 'department'>;
    marker?: Pick<User, 'id' | 'name'>;
    created_at: string;
    updated_at: string;
}

export interface EngagementEventDetailResponse {
    event: EngagementEvent & { attendances?: EngagementAttendance[] };
    attendance: {
        present: number;
        absent: number;
        total_marked: number;
    };
}

export interface MyTasksResponse {
    tasks: Task[];
    subtasks: Task[];
}