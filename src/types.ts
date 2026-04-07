export type Priority = 'high' | 'medium' | 'low';
export type Status = 'not_started' | 'in_progress' | 'blocked' | 'completed';
export type ViewMode = 'list' | 'kanban' | 'timeline';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Lane {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface Project {
  id: string;
  name: string;
  laneId: string;
  status: Status;
  priority: Priority;
  deadline?: string;
  description: string;
  progress: number; // 0-100
  tags: string[]; // tag ids
  background: string;
  nextSteps: string;
  risks: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  laneId: string;
  status: Status;
  priority: Priority;
  deadline?: string;
  description: string;
  currentProgress: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  lanes: Lane[];
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
}

export const STATUS_LABELS: Record<Status, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  blocked: '阻塞',
  completed: '已完成',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const STATUS_COLORS: Record<Status, string> = {
  not_started: 'bg-gray-100 text-gray-600 border-gray-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  blocked: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-slate-500 bg-slate-50 border-slate-200',
};

export const PRIORITY_DOT_COLORS: Record<Priority, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};
