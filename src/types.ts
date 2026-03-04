export interface Employee {
  id: number;
  name: string;
  status: string;
  position: string;
  dept: string;
  manager_id?: number;
  hire_date: string;
  salary_base: number;
  ssn: string;
  goals?: Goal[];
  logs?: CoachingLog[];
  appraisals?: Appraisal[];
  discipline?: DisciplineRecord[];
  property?: Property[];
}

export interface Goal {
  id: number;
  employee_id: number;
  statement: string;
  metric: string;
  target_date: string;
}

export interface CoachingLog {
  id: number;
  employee_id: number;
  category: string;
  notes: string;
  is_positive: number;
  logged_by: string;
  created_at: string;
}

export interface Appraisal {
  id: number;
  employee_id: number;
  job_knowledge: number;
  productivity: number;
  attendance: number;
  overall: number;
  promotability_status: string;
  sign_off_date: string;
}

export interface DisciplineRecord {
  id: number;
  employee_id: number;
  violation_type: string;
  warning_level: string;
  employer_statement: string;
  employee_statement: string;
  action_taken: string;
}

export interface Property {
  id: number;
  employee_id: number;
  brand: string;
  serial_no: string;
  uom_qty: number;
}

declare global {
  interface Window {
    notify?: (message: string, type: 'success' | 'error' | 'info') => void;
  }
}
