import React, { useState } from 'react';
import { Calendar, Search, Trash2, Edit2, CheckCircle2, Circle, Clock, Check, RefreshCw, Sparkles, BookOpen, User, FolderPlus } from 'lucide-react';
import { Task, TaskCategory, Priority, TaskStatus } from '../types';
import { formatToRelativeDate, getTodayDateString } from '../utils';
import { createGoogleCalendarEvent, getGoogleCalendarEventRSVP } from '../googleAuth';

interface TaskCenterProps {
  tasks: Task[];
  activeDate: string;
  setActiveDate: (date: string) => void;
  onToggleStatus: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (task: Task) => void;
  googleUser: any;
  googleToken: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onTriggerToast?: (msg: string) => void;
}

export default function TaskCenter({
  tasks,
  activeDate,
  setActiveDate,
  onToggleStatus,
  onDeleteTask,
  onUpdateTask,
  googleUser,
  googleToken,
  onGoogleSignIn,
  onGoogleSignOut,
  onTriggerToast
}: TaskCenterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [checkingRsvpId, setCheckingRsvpId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Autocheck RSVP for tasks of the active date on load/transition to keep statuses fresh completely automatically
  React.useEffect(() => {
    if (!googleToken) return;
    const activeDateTasks = tasks.filter(t => t.date === activeDate && t.googleEventId && t.email);
    if (activeDateTasks.length === 0) return;

    // Use a small delay to avoid race conditions with quick state transitions
    const timer = setTimeout(() => {
      const autoCheck = async () => {
        for (const task of activeDateTasks) {
          try {
            const rsvpData = await getGoogleCalendarEventRSVP(googleToken, task.googleEventId!, task.email!);
            if (rsvpData) {
              let updatedStatus = task.status;
              if (rsvpData.rsvpStatus === 'accepted' && task.status === 'Pendente') {
                updatedStatus = 'Em Progresso';
              } else if (rsvpData.rsvpStatus === 'declined' && task.status === 'Em Progresso') {
                updatedStatus = 'Pendente';
              }
              if (task.rsvpStatus !== rsvpData.rsvpStatus || task.status !== updatedStatus || rsvpData.hangoutLink !== task.googleMeetLink) {
                onUpdateTask({
                  ...task,
                  rsvpStatus: rsvpData.rsvpStatus,
                  googleMeetLink: rsvpData.hangoutLink || task.googleMeetLink,
                  status: updatedStatus
                });
              }
            }
          } catch (err: any) {
            console.error('Auto RSVP check failed for task ID:', task.id, err);
            const isUnauthenticated = err?.message?.includes('401') || err?.message?.includes('UNAUTHENTICATED');
            if (isUnauthenticated) {
              onGoogleSignOut();
              if (onTriggerToast) {
                onTriggerToast('Sua sessão do Google Agenda expirou. Por favor, conecte novamente.');
              }
              break; // Stop checking other tasks if already signed out
            }
          }
        }
      };
      autoCheck();
    }, 600);

    return () => clearTimeout(timer);
  }, [activeDate, googleToken]);

  const handleManualSync = async (task: Task) => {
    if (!googleToken) return;
    setSyncingTaskId(task.id);
    try {
      const eventRes = await createGoogleCalendarEvent(googleToken, {
        title: task.title,
        description: task.description,
        date: task.date,
        time: task.time,
        category: task.category,
        priority: task.priority,
        email: task.email
      });
      if (eventRes) {
        onUpdateTask({
          ...task,
          googleEventId: eventRes.id,
          googleEventLink: eventRes.htmlLink,
          googleMeetLink: eventRes.hangoutLink
        });
      }
    } catch (err: any) {
      console.error(err);
      const isUnauthenticated = err?.message?.includes('401') || err?.message?.includes('UNAUTHENTICATED');
      if (isUnauthenticated) {
        onGoogleSignOut();
        if (onTriggerToast) {
          onTriggerToast('Sua sessão do Google Agenda expirou. Por favor, conecte novamente.');
        }
      } else {
        if (onTriggerToast) {
          onTriggerToast('Houve um erro ao sincronizar esta tarefa com o Google Agenda.');
        }
      }
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleCheckRSVP = async (task: Task) => {
    if (!googleToken || !task.googleEventId || !task.email) return;
    setCheckingRsvpId(task.id);
    try {
      const rsvpData = await getGoogleCalendarEventRSVP(googleToken, task.googleEventId, task.email);
      if (rsvpData) {
        let updatedStatus = task.status;
        if (rsvpData.rsvpStatus === 'accepted' && task.status === 'Pendente') {
          updatedStatus = 'Em Progresso';
        } else if (rsvpData.rsvpStatus === 'declined' && task.status === 'Em Progresso') {
          updatedStatus = 'Pendente';
        }
        onUpdateTask({
          ...task,
          rsvpStatus: rsvpData.rsvpStatus,
          googleMeetLink: rsvpData.hangoutLink || task.googleMeetLink,
          status: updatedStatus
        });
      }
    } catch (err: any) {
      console.error(err);
      const isUnauthenticated = err?.message?.includes('401') || err?.message?.includes('UNAUTHENTICATED');
      if (isUnauthenticated) {
        onGoogleSignOut();
        if (onTriggerToast) {
          onTriggerToast('Sua sessão do Google Agenda expirou. Por favor, conecte novamente.');
        }
      } else {
        if (onTriggerToast) {
          onTriggerToast('Erro ao obter status do RSVP no Google Agenda.');
        }
      }
    } finally {
      setCheckingRsvpId(null);
    }
  };

  const handleSyncAllRSVPs = async () => {
    if (!googleToken) return;
    setIsSyncingAll(true);
    try {
      const tasksToSync = tasks.filter(t => t.googleEventId && t.email);
      for (const t of tasksToSync) {
        const rsvpData = await getGoogleCalendarEventRSVP(googleToken, t.googleEventId!, t.email!);
        if (rsvpData) {
          let updatedStatus = t.status;
          if (rsvpData.rsvpStatus === 'accepted' && t.status === 'Pendente') {
            updatedStatus = 'Em Progresso';
          } else if (rsvpData.rsvpStatus === 'declined' && t.status === 'Em Progresso') {
            updatedStatus = 'Pendente';
          }
          onUpdateTask({
            ...t,
            rsvpStatus: rsvpData.rsvpStatus,
            googleMeetLink: rsvpData.hangoutLink || t.googleMeetLink,
            status: updatedStatus
          });
        }
      }
    } catch (err: any) {
      console.error('Error syncing all RSVPs:', err);
      const isUnauthenticated = err?.message?.includes('401') || err?.message?.includes('UNAUTHENTICATED');
      if (isUnauthenticated) {
        onGoogleSignOut();
        if (onTriggerToast) {
          onTriggerToast('Sua sessão do Google Agenda expirou. Por favor, conecte novamente.');
        }
      } else {
        if (onTriggerToast) {
          onTriggerToast('Erro ao atualizar a sincronização das tarefas.');
        }
      }
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Estados locais para deleção com confirmação
  const [taskDeleting, setTaskDeleting] = useState<Task | null>(null);

  const confirmDelete = () => {
    if (taskDeleting) {
      onDeleteTask(taskDeleting.id);
      setTaskDeleting(null);
    }
  };

  // Estados locais para edição
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<TaskCategory>('Agendamento');
  const [editPriority, setEditPriority] = useState<Priority>('Média');
  const [editEstimated, setEditEstimated] = useState(25);
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('Pendente');
  const [editTime, setEditTime] = useState('');

  // Estado para armazenar o dia central do carrossel (padrão é o dia ativo, ex: hoje no primeiro load)
  const [carouselCenterDate, setCarouselCenterDate] = useState<string>(activeDate || getTodayDateString());

  // Sincroniza o centro do carrossel se a data ativa mudar externamente ou por clique
  React.useEffect(() => {
    if (activeDate) {
      setCarouselCenterDate(activeDate);
    }
  }, [activeDate]);

  // Função utilitária segura para deslocar datas
  const shiftDate = (dateStr: string, daysToShift: number): string => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + daysToShift);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handlePrevDay = () => {
    const newDate = shiftDate(carouselCenterDate, -1);
    setCarouselCenterDate(newDate);
    setActiveDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = shiftDate(carouselCenterDate, 1);
    setCarouselCenterDate(newDate);
    setActiveDate(newDate);
  };

  // Gera os 7 dias centrados na data alvo (carouselCenterDate) dinamicamente
  const getCalendarDays = () => {
    const days = [];
    const todayStr = getTodayDateString();
    const parts = carouselCenterDate.split('-');
    const baseDate = parts.length === 3 
      ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      : new Date();
    
    for (let i = -3; i <= 3; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
      days.push({
        dateStr,
        dayNum: d.getDate(),
        dayName: weekdays[d.getDay()],
        isToday: dateStr === todayStr
      });
    }
    return days;
  };

  const calendarDays = getCalendarDays();

  // Inicia edição de uma tarefa
  const startEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditCategory(task.category);
    setEditPriority(task.priority);
    setEditEstimated(task.estimatedMinutes);
    setEditEmail(task.email || '');
    setEditStatus(task.status);
    setEditTime(task.time || '');
  };

  const saveEdit = (task: Task) => {
    if (!editTitle.trim()) return;

    onUpdateTask({
      ...task,
      title: editTitle.trim(),
      description: editCategory === 'Notas' ? editDesc.trim() : undefined,
      category: editCategory,
      priority: editPriority,
      estimatedMinutes: Number(editEstimated) || 25,
      email: editCategory === 'Agendamento' ? editEmail.trim() : undefined,
      status: editStatus,
      time: editCategory === 'Agendamento' && editTime ? editTime : undefined
    });
    setEditingTaskId(null);
  };

  // Filtros aplicados às tarefas
  const filteredTasks = tasks.filter(t => {
    const matchesDate = t.date === activeDate;
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || t.category === selectedCategory;
    return matchesDate && matchesSearch && matchesCategory;
  });

  // Outras tarefas (agendadas para outros dias) para dar visibilidade rápida
  const otherTasks = tasks.filter(t => {
    const isOtherDate = t.date !== activeDate;
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase());
    return isOtherDate && matchesSearch;
  });

  const categories: string[] = ['Todas', 'Agendamento', 'Curinga', 'Disponível', 'Notas'];

  return (
    <div className="flex-1 flex flex-col space-y-6 pb-24">
      {/* TÍTULO DA SEÇÃO */}
      <section className="px-2">
        <h2 className="text-4xl font-extrabold uppercase leading-[0.9] tracking-tighter mb-1 text-white">
          Agenda &<br/>Tarefas
        </h2>
        <p className="text-gray-300 text-sm">Visualização tática dos compromissos</p>
      </section>

      {/* BANNER DO GOOGLE CALENDAR */}
      <section className="px-2">
        {googleUser ? (
          <div className="flex items-center justify-between bg-[#2DD4BF]/5 border border-[#2DD4BF]/20 rounded-2xl px-4 py-2.5 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-gray-300">Agenda: </span>
              <span className="text-white font-semibold font-mono">{googleUser.email}</span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleSyncAllRSVPs}
                disabled={isSyncingAll}
                className="text-[10px] text-[#2DD4BF] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={9} className={isSyncingAll ? "animate-spin" : ""} />
                Atualizar Respostas
              </button>
              <button
                onClick={onGoogleSignOut}
                className="text-[10px] text-gray-400 hover:text-red-400 font-mono underline cursor-pointer hover:no-underline shrink-0"
              >
                Sair
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-xs">
            <span className="text-gray-400">Sincronização com Google Agenda desligada.</span>
            <button
              onClick={onGoogleSignIn}
              className="px-2.5 py-1 text-[10px] font-bold bg-[#2DD4BF]/15 border border-[#2DD4BF]/30 hover:bg-[#2DD4BF]/25 text-[#2DD4BF] transition rounded-lg cursor-pointer flex items-center gap-1 shrink-0 ml-2"
            >
              Conectar
            </button>
          </div>
        )}
      </section>

      {/* CARROSSEL DE CALENDÁRIO SLIM INTERATIVO COM NAVEGAÇÃO DINÂMICA */}
      <section className="px-2 flex items-center justify-between" id="dynamic_date_navigation_carousel">
        {/* Seta para a esquerda */}
        <button
          onClick={handlePrevDay}
          className="w-10 h-[74px] rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-[#2DD4BF] hover:bg-[#2DD4BF]/10 hover:border-[#2DD4BF]/30 transition active:scale-90 cursor-pointer text-sm font-bold shadow-[0_0_10px_rgba(45,212,191,0.05)]"
          title="Dia Anterior"
          aria-label="Dia Anterior"
        >
          ◀
        </button>

        {/* Carrossel de datas */}
        <div className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-none py-1 mx-2 flex justify-center">
          <div className="flex space-x-2">
            {calendarDays.map((day) => {
              const isSelected = day.dateStr === activeDate;
              return (
                <button
                  key={day.dateStr}
                  onClick={() => setActiveDate(day.dateStr)}
                  id={`calendar_day_${day.dateStr}`}
                  className={`w-[44px] sm:w-[50px] md:w-[54px] h-[74px] rounded-2xl flex flex-col items-center justify-center transition-all duration-100 cursor-pointer active:scale-95 ${
                    isSelected 
                      ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.3)] font-extrabold scale-105' 
                      : 'bg-white/5 text-gray-300 border border-white/5 hover:border-white/20 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-[8px] sm:text-[9px] uppercase tracking-wider font-mono opacity-80 mb-1">
                    {day.dayName}
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold leading-none">
                    {day.dayNum}
                  </span>
                  {day.isToday && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] mt-1.5 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seta para a direita */}
        <button
          onClick={handleNextDay}
          className="w-10 h-[74px] rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-[#2DD4BF] hover:bg-[#2DD4BF]/10 hover:border-[#2DD4BF]/30 transition active:scale-90 cursor-pointer text-sm font-bold shadow-[0_0_10px_rgba(45,212,191,0.05)]"
          title="Próximo Dia"
          aria-label="Próximo Dia"
        >
          ▶
        </button>
      </section>

      {/* BARRA DE PESQUISA E FILTROS */}
      <section className="px-2 space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-300">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Pesquisar tarefas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/50 placeholder-gray-500 backdrop-blur-md transition min-h-[48px]"
          />
        </div>

        {/* Tags de Categoria */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2.5 rounded-2xl text-sm font-semibold border transition shrink-0 cursor-pointer active:scale-95 min-h-[44px] flex items-center justify-center ${
                  isSelected 
                    ? 'bg-[#2DD4BF]/20 border-[#2DD4BF] text-[#2DD4BF]' 
                    : 'bg-white/5 border-white/5 text-gray-300 hover:text-white hover:border-white/10 hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* LISTA PRINCIPAL DESSA DATA */}
      <section className="px-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-xs uppercase tracking-widest text-white">
            Atividades de {formatToRelativeDate(activeDate)}
          </h3>
          <span className="text-xs text-gray-400 font-mono">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'tarefa' : 'tarefas'}
          </span>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-gray-400 text-sm">
            Nenhuma tarefa encontrada neste filtro para este dia.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div 
                key={task.id}
                className={`glass rounded-2xl p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/5 ${
                  task.status === 'Concluída' 
                    ? 'opacity-60 bg-white/[0.01]' 
                    : ''
                }`}
              >
                {editingTaskId === task.id ? (
                  // FORM DE EDIÇÃO RÁPIDA DINÂMICO
                  <div className="space-y-4 animate-fade-in py-2">
                    {/* Alterador de Categoria */}
                    <div>
                      <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Categoria *</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as TaskCategory)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px] cursor-pointer"
                      >
                        <option value="Agendamento">Agendamento</option>
                        <option value="Curinga">Curinga</option>
                        <option value="Disponível">Disponível</option>
                        <option value="Notas">Notas</option>
                      </select>
                    </div>

                    {/* Campos Contextuais */}
                    {editCategory === 'Agendamento' && (
                      <>
                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Assunto *</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Assunto"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px]"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">E-mail *</label>
                          <input
                            type="email"
                            inputMode="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="paciente@email.com"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px]"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Status *</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                            className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px] cursor-pointer"
                          >
                            <option value="Pendente">Pendente</option>
                            <option value="Em Progresso">Em Progresso</option>
                            <option value="Concluída">Concluída</option>
                          </select>
                        </div>
                      </>
                    )}

                    {editCategory === 'Curinga' && (
                      <>
                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Nome da paciente *</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Nome da Paciente"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px]"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Status *</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                            className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px] cursor-pointer"
                          >
                            <option value="Pendente">Pendente</option>
                            <option value="Em Progresso">Em Progresso</option>
                            <option value="Concluída">Concluída</option>
                          </select>
                        </div>
                      </>
                    )}

                    {editCategory === 'Disponível' && (
                      <>
                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Nome da profissional *</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Nome da Profissional"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px]"
                          />
                        </div>
                      </>
                    )}

                    {editCategory === 'Notas' && (
                      <>
                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Assunto *</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Assunto"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px]"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Texto *</label>
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Conteúdo detalhado da nota"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] h-24 resize-none"
                          />
                        </div>
                      </>
                    )}

                    {/* Hora (somente para agendamento) */}
                    {editCategory === 'Agendamento' && (
                      <div>
                        <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Hora *</label>
                        <input
                          type="time"
                          required
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] cursor-pointer min-h-[48px]"
                        />
                      </div>
                    )}

                    {/* Outros Ajustes (Prioridade) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-300 uppercase tracking-widest font-bold mb-1.5 block">Prioridade</label>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value as Priority || 'Baixa')}
                          className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] min-h-[48px] cursor-pointer"
                        >
                          <option value="Alta">Alta</option>
                          <option value="Média">Média</option>
                          <option value="Baixa">Baixa</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-white/5">
                      <div className="flex items-center space-x-2 text-sm text-gray-300">
                        <Clock size={16} />
                        <span>Estimativa:</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editEstimated}
                          onChange={(e) => setEditEstimated(Number(e.target.value))}
                          className="w-14 bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-center text-base text-white min-h-[40px]"
                        />
                        <span>m</span>
                      </div>

                      <div className="flex space-x-2.5">
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(null)}
                          className="px-4 py-3 text-sm border border-white/10 rounded-xl hover:bg-white/10 transition text-gray-300 active:scale-95 cursor-pointer min-h-[44px] flex items-center justify-center font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(task)}
                          className="px-5 py-3 text-sm bg-[#2DD4BF] text-black font-bold rounded-xl hover:bg-[#20bda8] transition active:scale-95 cursor-pointer min-h-[44px] flex items-center justify-center"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // TAREFA NO MODO INTEGRAÇÃO
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <button 
                        onClick={() => onToggleStatus(task.id)}
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
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                            task.priority === 'Alta' 
                              ? 'bg-rose-500/10 text-rose-400 font-bold' 
                              : task.priority === 'Média'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {task.priority}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-300 font-mono border border-white/5">
                            {task.category}
                          </span>
                          {task.googleEventId && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#2DD4BF]/10 text-[#2DD4BF] font-semibold font-mono border border-[#2DD4BF]/25 flex items-center gap-1">
                              <span className="w-1 h-1 bg-[#2DD4BF] rounded-full animate-pulse" />
                              Sincronizado
                            </span>
                          )}
                        </div>

                        <h4 className={`font-semibold text-sm mt-1 text-white ${
                          task.status === 'Concluída' ? 'line-through text-gray-400' : ''
                        }`}>
                          {task.category === 'Curinga' ? `Paciente: ${task.title}` : task.category === 'Disponível' ? `Profissional: ${task.title}` : task.title}
                        </h4>

                        {task.category === 'Agendamento' && (
                          <div className="space-y-1.5">
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

                            {task.googleMeetLink && (
                              <div className="pt-0.5">
                                <a
                                  href={task.googleMeetLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2DD4BF] bg-[#2DD4BF]/10 px-2.5 py-1 rounded-xl border border-[#2DD4BF]/30 hover:bg-[#2DD4BF]/20 transition mt-1 cursor-pointer"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  <span>Entrar no Google Meet</span>
                                </a>
                              </div>
                            )}

                            {task.googleEventId && task.email && (
                              <div className="flex items-center gap-2 pt-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border flex items-center gap-1 ${
                                  task.rsvpStatus === 'accepted'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                    : task.rsvpStatus === 'declined'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                    : task.rsvpStatus === 'tentative'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                    : 'bg-white/5 text-gray-400 border-white/5'
                                }`}>
                                  RSVP: {
                                    task.rsvpStatus === 'accepted' ? 'Confirmado ✔' :
                                    task.rsvpStatus === 'declined' ? 'Recusado ✖' :
                                    task.rsvpStatus === 'tentative' ? 'Talvez ⌛' :
                                    'Sem resposta ✉'
                                  }
                                </span>
                                {googleToken && (
                                  <button
                                    onClick={() => handleCheckRSVP(task)}
                                    disabled={checkingRsvpId === task.id}
                                    className="text-[9px] text-[#2DD4BF] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title="Atualizar resposta do paciente"
                                  >
                                    <RefreshCw size={9} className={checkingRsvpId === task.id ? "animate-spin" : ""} />
                                    Verificar Resposta
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {task.description && (
                          <p className={`text-xs text-gray-300 mt-0.5 ${
                            task.status === 'Concluída' ? 'line-through text-gray-400' : ''
                          }`}>
                            {task.category === 'Notas' ? `${task.description}` : task.description}
                          </p>
                        )}

                        {task.actualMinutes > 0 && (
                          <div className="flex items-center space-x-4 mt-2 text-[10px] text-[#2DD4BF] font-mono">
                            <span className="flex items-center space-x-1">
                              <Clock size={11} />
                              <span>Trabalhado: {task.actualMinutes}m</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOTÕES DE AÇÃO */}
                    <div className="flex space-x-2 shrink-0 ml-2.5">
                      <button
                        onClick={() => startEdit(task)}
                        className="w-11 h-11 bg-white/5 border border-white/10 hover:bg-white/15 hover:text-white text-gray-300 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-90"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setTaskDeleting(task)}
                        className="w-11 h-11 bg-white/5 border border-white/10 hover:bg-rose-950/45 hover:text-rose-400 text-gray-300 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Confirmação de Exclusão */}
      {taskDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop com desfoque de fundo */}
          <div 
            className="absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity"
            onClick={() => setTaskDeleting(null)}
          />
          
          {/* Conteúdo do Modal */}
          <div className="relative bg-[#0d0d0d] border border-white/10 rounded-3xl max-w-sm w-full p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Excluir Tarefa?
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed mt-1">
                  Tem certeza de que deseja excluir <span className="text-white font-semibold">"{taskDeleting.title}"</span>? Esta ação removerá a tarefa e é irreversível.
                </p>
              </div>
              {taskDeleting.googleEventId && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs leading-relaxed space-y-1">
                  <p className="font-bold">⚠️ Sincronizado com Google Agenda</p>
                  <p>Excluir esta tarefa também cancelará e removerá o compromisso correspondente no seu Google Agenda de forma automática.</p>
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setTaskDeleting(null)}
                className="flex-1 px-4 py-3 text-sm bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl transition font-semibold min-h-[44px] cursor-pointer active:scale-95 flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 text-sm bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition min-h-[44px] cursor-pointer active:scale-95 flex items-center justify-center shadow-[0_0_18px_rgba(239,68,68,0.25)]"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
