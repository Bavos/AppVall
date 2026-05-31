export type Priority = 'Alta' | 'Média' | 'Baixa';
export type TaskCategory = 'Agendamento' | 'Curinga' | 'Disponível' | 'Notas';
export type TaskStatus = 'Pendente' | 'Em Progresso' | 'Concluída';

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  category: TaskCategory;
  priority: Priority;
  status: TaskStatus;
  estimatedMinutes: number;
  actualMinutes: number;
  createdAt: string;
  userEmail?: string;
  googleEventId?: string;
  googleEventLink?: string;
  googleMeetLink?: string;
  rsvpStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  email?: string;
  time?: string; // HH:MM
}

export interface FocusSession {
  id: string;
  taskId?: string;
  taskTitle?: string;
  durationMinutes: number;
  timestamp: string;
}

export type ViewTab = 'dashboard' | 'tasks' | 'add';
