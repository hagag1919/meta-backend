export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'administrator' | 'developer' | 'client';
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  company_id: string;
  project_manager_id: string;
  budget?: number;
  currency: string;
  start_date: string;
  end_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  status: 'planning' | 'ongoing' | 'completed' | 'stopped';
  progress_percentage: number;
  repository_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  project_id: string;
  milestone_id?: string;
  assigned_to?: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours?: number;
  actual_hours?: number;
  due_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone?: string;
  address?: string;
  website?: string;
  industry?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  task_id?: string;
  date_worked: string;
  hours_worked: number;
  description: string;
  is_billable: boolean;
  hourly_rate?: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  project_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  content: string;
  entity_type: 'project' | 'task';
  entity_id: string;
  user_id: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  user?: Pick<User, 'id' | 'first_name' | 'last_name' | 'email'>;
}

export interface FileUpload {
  id: string;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  project_id?: string;
  task_id?: string;
  uploaded_by: string;
  is_public: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  total_hours: number;
  billable_hours: number;
  total_revenue: number;
  pending_invoices: number;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    current_page: number;
    total_pages: number;
    total_items: number;
    has_next: boolean;
    has_prev: boolean;
  };
}