import { Task } from './types';

// Formata uma string de data YYYY-MM-DD para o formato abreviado "Sex., 29 Mai."
export function formatToRelativeDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  
  const weekdays = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'];
  const months = [
    'Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 
    'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'
  ];
  
  const weekday = weekdays[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${weekday}, ${day} ${month}`;
}

// Formata para o formato completo "29 de maio, 2026"
export function formatToFullDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const monthsFull = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  
  return `${date.getDate()} de ${monthsFull[date.getMonth()]}, ${date.getFullYear()}`;
}

// Retorna a string da data de hoje no formato YYYY-MM-DD
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Lista de tarefas padrão para iniciar o app com dados reais interessantes
export const DEFAULT_TASKS: Task[] = [
  {
    id: 'task-1',
    title: 'Rever métricas de conversão e funil de vendas',
    description: 'Analisar as taxas de rejeição na página de checkout e otimizar velocidade de carregamento.',
    date: '2026-05-29',
    category: 'Agendamento',
    status: 'Pendente',
    estimatedMinutes: 50,
    actualMinutes: 25,
    createdAt: '2026-05-29T10:00:00Z',
    time: '14:30',
    email: 'diretoria@empresa.com'
  },
  {
    id: 'task-2',
    title: 'Sessão diária de escrita criativa e leitura analítica',
    description: 'Ler 10 páginas e escrever o sumário conceitual do próximo capítulo.',
    date: '2026-05-29',
    category: 'Curinga',
    status: 'Em Progresso',
    estimatedMinutes: 30,
    actualMinutes: 15,
    createdAt: '2026-05-29T11:00:00Z'
  },
  {
    id: 'task-3',
    title: 'Treino regenerativo aeróbico',
    description: '45 minutos de corrida moderada ouvindo podcast técnico.',
    date: '2026-05-29',
    category: 'Disponível',
    status: 'Concluída',
    estimatedMinutes: 45,
    actualMinutes: 45,
    createdAt: '2026-05-29T08:00:00Z'
  },
  {
    id: 'task-4',
    title: 'Briefing do novo design Vall Dashboard',
    description: 'Desenhar wireframes preliminares no papel e documentar a paleta de cores minimalista.',
    date: '2026-05-30',
    category: 'Notas',
    status: 'Pendente',
    estimatedMinutes: 60,
    actualMinutes: 0,
    createdAt: '2026-05-29T15:30:00Z'
  }
];
