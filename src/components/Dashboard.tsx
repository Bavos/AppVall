import React from 'react';
import { CheckCircle2, Circle, Clock, Zap, Calendar, CalendarRange, ChevronDown, ChevronUp } from 'lucide-react';
import { Task } from '../types';
import { formatToRelativeDate, getTodayDateString } from '../utils';

interface DashboardProps {
  tasks: Task[];
  activeDate: string;
  onToggleStatus: (id: string) => void;
  onAddTaskTab: () => void;
  onViewTasksTab: () => void;
  userName: string;
}

export default function Dashboard({
  tasks,
  activeDate,
  onToggleStatus,
  onAddTaskTab,
  onViewTasksTab,
  userName
}: DashboardProps) {
  const todayStr = getTodayDateString();
  const [showWeeklyCompromissos, setShowWeeklyCompromissos] = React.useState(false);

  // Função para retornar os 7 dias da semana (Segunda a Domingo) baseado no dia de hoje
  const daysOfWeek = React.useMemo(() => {
    const parts = todayStr.split('-');
    if (parts.length !== 3) return [];
    
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday...
    
    // Distância para a Segunda-feira
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);
    
    const days = [];
    const weekdays = [
      'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'
    ];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;
      days.push({
        dateStr,
        dayName: weekdays[i],
        dayNum: d.getDate(),
        monthNum: d.getMonth() + 1,
        isToday: dateStr === todayStr
      });
    }
    return days;
  }, [todayStr]);

  const startOfWeek = daysOfWeek[0]?.dateStr || '';
  const endOfWeek = daysOfWeek[6]?.dateStr || '';

  const weeklyTasks = React.useMemo(() => {
    if (!startOfWeek || !endOfWeek) return [];
    return tasks.filter(t => t.date >= startOfWeek && t.date <= endOfWeek);
  }, [tasks, startOfWeek, endOfWeek]);

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

        <div className="pt-2 space-y-4">
          <button 
            onClick={() => setShowWeeklyCompromissos(!showWeeklyCompromissos)}
            className="w-full text-sm font-bold bg-[#2DD4BF]/10 hover:bg-[#2DD4BF]/20 border border-[#2DD4BF]/30 text-[#2DD4BF] py-3.5 px-5 rounded-2xl transition cursor-pointer active:scale-95 min-h-[48px] flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(45,212,191,0.05)]"
          >
            <Calendar size={16} />
            <span>
              {showWeeklyCompromissos ? 'Ocultar compromissos da semana' : 'Verificar compromissos da semana'}
            </span>
            {showWeeklyCompromissos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showWeeklyCompromissos && (
            <div className="glass rounded-2xl p-5 border border-white/10 space-y-4 animate-in fade-in duration-200" id="id_weekly_commitments">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center space-x-2 text-[#2DD4BF]">
                  <CalendarRange size={18} />
                  <h4 className="font-extrabold text-sm uppercase tracking-wider">Compromissos da Semana</h4>
                </div>
                <span className="text-[10px] bg-white/5 px-2.5 py-1 rounded-lg text-gray-400 font-mono border border-white/5">
                  {daysOfWeek[0] && formatDateShort(daysOfWeek[0].dateStr)} - {daysOfWeek[6] && formatDateShort(daysOfWeek[6].dateStr)}
                </span>
              </div>

              <div className="space-y-4">
                {daysOfWeek.map((day) => {
                  const dayTasks = weeklyTasks.filter(t => t.date === day.dateStr)
                    .sort((a, b) => {
                      const timeA = a.time || '23:59';
                      const timeB = b.time || '23:59';
                      if (timeA !== timeB) return timeA.localeCompare(timeB);
                      const pA = priorityOrder[a.priority] || 4;
                      const pB = priorityOrder[b.priority] || 4;
                      return pA - pB;
                    });

                  return (
                    <div key={day.dateStr} className="space-y-1.5 pb-2 border-b border-white/[0.03] last:border-0 last:pb-0">
                      {/* Day Header */}
                      <div className="flex items-center justify-between text-xs font-semibold py-1">
                        <span className={`flex items-center gap-1.5 ${day.isToday ? 'text-[#2DD4BF] font-extrabold' : 'text-gray-300'}`}>
                          {day.dayName}
                          {day.isToday && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2DD4BF]/10 text-[#2DD4BF] font-mono">
                              Hoje
                            </span>
                          )}
                        </span>
                        <span className="text-gray-400 font-mono text-[10px]">
                          {day.dayNum}/{day.monthNum}
                        </span>
                      </div>

                      {/* Day's Tasks */}
                      {dayTasks.length === 0 ? (
                        <p className="text-xs text-gray-500 italic pl-3 border-l border-white/5 py-0.5">
                          Livre de compromissos
                        </p>
                      ) : (
                        <div className="space-y-2 pl-3 border-l border-[#2DD4BF]/25 py-0.5">
                          {dayTasks.map((task) => (
                            <div 
                              key={task.id}
                              className={`flex items-start justify-between text-xs py-1 transition-all ${
                                task.status === 'Concluída' ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex items-start space-x-2 flex-1 min-w-0">
                                <button 
                                  onClick={() => onToggleStatus(task.id)}
                                  className="text-gray-400 hover:text-[#2DD4BF] transition shrink-0 mt-0.5 flex items-center justify-center cursor-pointer min-h-[16px] min-w-[16px]"
                                >
                                  {task.status === 'Concluída' ? (
                                    <CheckCircle2 size={14} className="text-[#2DD4BF]" />
                                  ) : (
                                    <Circle size={14} className="text-gray-400 hover:text-[#2DD4BF]" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <span className={`font-semibold text-white ${task.status === 'Concluída' ? 'line-through text-gray-400' : ''}`}>
                                    {task.category === 'Curinga' ? `Paciente: ${task.title}` : task.category === 'Disponível' ? `Profissional: ${task.title}` : task.title}
                                  </span>
                                  {task.time && (
                                    <span className="ml-2 inline-flex items-center text-[9px] font-bold text-[#2DD4BF] bg-[#2DD4BF]/10 px-1.5 py-0.5 rounded border border-[#2DD4BF]/20 font-mono">
                                      {task.time}
                                    </span>
                                  )}
                                  <span className="ml-2 text-[9px] text-gray-400 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                    {task.category}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
