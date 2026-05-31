import React from 'react';
import { CheckCircle2, Circle, Clock, Zap } from 'lucide-react';
import { Task } from '../types';
import { formatToRelativeDate, getTodayDateString } from '../utils';

interface DashboardProps {
  tasks: Task[];
  activeDate: string;
  onToggleStatus: (id: string) => void;
  onAddTaskTab: () => void;
  userName: string;
}

export default function Dashboard({
  tasks,
  activeDate,
  onToggleStatus,
  onAddTaskTab,
  userName
}: DashboardProps) {
  const todayStr = getTodayDateString();

  // Helper para formatar a data de forma curta e elegante (ex: 29 Mai.)
  const formatDateShort = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const day = parts[2];
    const months = ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const monthName = months[monthIdx] || '';
    return `${day} ${monthName}`;
  };

  // Mapeamento de prioridades para ordenação de importância (Alta -> 1, Média -> 2, Baixa -> 3)
  const priorityOrder: Record<string, number> = {
    'Alta': 1,
    'Média': 2,
    'Baixa': 3
  };

  // Filtra as tarefas de hoje e ordena por importância
  const todayTasks = tasks
    .filter(t => t.date === todayStr)
    .sort((a, b) => {
      const pA = priorityOrder[a.priority] || 4;
      const pB = priorityOrder[b.priority] || 4;
      return pA - pB;
    });

  return (
    <div className="flex-1 flex flex-col space-y-6 pb-24">
      {/* 2. CONTEXTO E SAUDAÇÃO */}
      <section className="px-2" id="id_dashboard_context">
        <h2 className="text-3xl font-light text-gray-400 mb-2">
          {formatToRelativeDate(todayStr)}
        </h2>
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-extrabold uppercase leading-[0.9] tracking-tighter mb-2 text-white">
              Painel<br/>Geral
            </h2>
            <p className="text-[#2DD4BF] font-mono text-sm tracking-wide flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-pulse"></span>
              Olá, {userName}
            </p>
          </div>
        </div>
      </section>

      {/* 4. HOJE: ENFOQUE DE ATIVIDADES */}
      <section className="px-2 space-y-4" id="id_dashboard_activities">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-sm uppercase tracking-widest text-white">Foco para Hoje</h3>
            <p className="text-xs text-gray-300">Tarefas de maior relevância</p>
          </div>
          <button 
            onClick={onAddTaskTab}
            className="text-xs font-bold text-[#2DD4BF] hover:text-[#5eead4] flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] px-3 -my-3 active:scale-95 transition-all"
          >
            <span>Nova Tarefa</span>
            <PlusIcon />
          </button>
        </div>

        {todayTasks.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-4">
            <Zap size={28} className="text-[#2DD4BF] animate-pulse" />
            <div className="text-sm text-gray-200">Nenhuma tarefa agendada para hoje.</div>
            <button 
              onClick={onAddTaskTab}
              className="text-sm font-bold bg-white/5 border border-white/10 text-[#2DD4BF] hover:bg-[#2DD4BF]/10 px-5 py-3.5 rounded-xl transition cursor-pointer active:scale-95 min-h-[44px]"
            >
              Planejar Dia
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {todayTasks.map((task) => (
              <div 
                key={task.id}
                id={`task_card_${task.id}`}
                className={`glass rounded-2xl p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/5 group ${
                  task.status === 'Concluída' 
                    ? 'opacity-60 bg-white/[0.01]' 
                    : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <button 
                      onClick={() => onToggleStatus(task.id)}
                      id={`btn_toggle_${task.id}`}
                      className="text-gray-400 hover:text-[#2DD4BF] transition cursor-pointer active:scale-75 shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] p-2.5 -m-2.5"
                    >
                      {task.status === 'Concluída' ? (
                        <CheckCircle2 size={22} className="text-[#2DD4BF]" />
                      ) : (
                        <Circle size={22} className="text-gray-400 hover:border-gray-300" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                          task.priority === 'Alta' 
                            ? 'bg-rose-500/10 text-rose-400' 
                            : task.priority === 'Média'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {task.priority}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300 font-mono border border-white/5">
                          {task.category}
                        </span>
                      </div>
                      
                      <h4 className={`font-semibold text-sm mt-1.5 text-white ${
                        task.status === 'Concluída' ? 'line-through text-gray-400' : ''
                      }`}>
                        {task.category === 'Curinga' ? `Paciente: ${task.title}` : task.category === 'Disponível' ? `Profissional: ${task.title}` : task.title}
                      </h4>

                      {task.category === 'Agendamento' && (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {task.time && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2DD4BF] bg-[#2DD4BF]/10 px-2.5 py-0.5 rounded-full border border-[#2DD4BF]/25 font-mono">
                              <Clock size={11} className="shrink-0" />
                              {task.time}
                            </span>
                          )}
                          {task.email && (
                            <p className="text-xs text-gray-300 font-mono">
                              E-mail: {task.email}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {task.description && (
                        <p className={`text-xs text-gray-300 mt-1 line-clamp-1 ${
                          task.status === 'Concluída' ? 'line-through text-gray-400' : ''
                        }`}>
                          {task.category === 'Notas' ? `${task.description}` : task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 self-start mt-1.5 ml-4">
                    <span className="text-[10px] text-gray-400 font-mono font-medium bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">
                      {formatDateShort(task.date)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}
