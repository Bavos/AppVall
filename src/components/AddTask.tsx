import React, { useState } from 'react';
import { PlusCircle, Clock, Calendar, Check, AlertCircle, LayoutGrid, CheckCircle, RefreshCw } from 'lucide-react';
import { Task, TaskCategory, Priority, TaskStatus } from '../types';
import { createGoogleCalendarEvent } from '../googleAuth';

interface AddTaskProps {
  activeDate: string;
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'status' | 'actualMinutes'> & { status?: TaskStatus }) => void;
  onChangeTab: (tab: 'dashboard' | 'tasks' | 'add' | 'timer') => void;
  googleUser: any;
  googleToken: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
}

export default function AddTask({
  activeDate,
  onAddTask,
  onChangeTab,
  googleUser,
  googleToken,
  onGoogleSignIn,
  onGoogleSignOut
}: AddTaskProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Agendamento');
  const [priority, setPriority] = useState<Priority>('Média');
  const [date, setDate] = useState(activeDate);
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [alertSuccess, setAlertSuccess] = useState(false);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Pendente');
  const [time, setTime] = useState('');

  const [syncGoogle, setSyncGoogle] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const categories: TaskCategory[] = ['Agendamento', 'Curinga', 'Disponível', 'Notas'];
  const priorities: Priority[] = ['Baixa', 'Média', 'Alta'];
  const presetMinutes = [15, 25, 45, 60, 90];

  const isSubmittingRef = React.useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    let googleEventId: string | undefined;
    let googleEventLink: string | undefined;
    let googleMeetLink: string | undefined;

    const eventDesc = category === 'Agendamento'
      ? `E-mail: ${email.trim()}`
      : category === 'Notas'
      ? description.trim()
      : '';

    try {
      if (syncGoogle && googleToken) {
        setIsSyncing(true);
        setSyncError(null);
        try {
          const eventRes = await createGoogleCalendarEvent(googleToken, {
            title: title.trim(),
            description: eventDesc,
            date,
            time: category === 'Agendamento' && time ? time : undefined,
            category,
            priority,
            estimatedMinutes,
            email: category === 'Agendamento' && email ? email.trim() : undefined
          });
          if (eventRes) {
            googleEventId = eventRes.id;
            googleEventLink = eventRes.htmlLink;
            googleMeetLink = eventRes.hangoutLink;
          }
        } catch (err: any) {
          console.error('Failed to sync to Google Calendar:', err);
          setSyncError('Não foi possível gravar no Google Agenda, mas a tarefa foi criada localmente.');
        } finally {
          setIsSyncing(false);
        }
      }

      onAddTask({
        title: title.trim(),
        description: category === 'Notas' ? description.trim() : undefined,
        category,
        priority,
        status, // Pass custom status
        date,
        time: category === 'Agendamento' && time ? time : undefined,
        estimatedMinutes,
        googleEventId,
        googleEventLink,
        googleMeetLink,
        email: category === 'Agendamento' ? email.trim() : undefined
      });

      // Mostra alerta de sucesso e limpa formulário
      setAlertSuccess(true);
      setTitle('');
      setDescription('');
      setEmail('');
      setTime('');
      setStatus('Pendente');
      
      setTimeout(() => {
        setAlertSuccess(false);
        onChangeTab('dashboard'); // Redireciona para o Painel Geral para ver a lista atualizada
        isSubmittingRef.current = false;
      }, 2000);
    } catch (err) {
      console.error('Error during submit:', err);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 pb-24">
      {/* TÍTULO DA SEÇÃO */}
      <section className="px-2">
        <h2 className="text-4xl font-extrabold uppercase leading-[0.9] tracking-tighter mb-1 text-white">
          Nova<br/>Tarefa
        </h2>
        <p className="text-gray-300 text-sm">Inscreva uma nova atividade operacional</p>
      </section>

      {/* ALERTA DE SUCESSO COESIVO */}
      {alertSuccess && (
        <div className="mx-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl flex items-center gap-3 backdrop-blur-md">
          <CheckCircle size={20} />
          <div>
            <div className="font-bold text-sm">Sucesso!</div>
            <div className="text-xs opacity-90">Tarefa adicionada e programada no fluxo diário.</div>
          </div>
        </div>
      )}

      {/* FORMULÁRIO */}
      <form onSubmit={handleSubmit} className="px-2 space-y-5" id="id_add_task_form">
        {/* Escolha da Categoria em Primeiro Lugar */}
        <div className="space-y-2">
          <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block mb-1">
            Categoria *
          </label>
          <div className="flex flex-wrap gap-2.5">
            {categories.map((cat) => {
              const isSelected = category === cat;
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-5 py-3 rounded-2xl text-sm font-semibold border transition cursor-pointer select-none active:scale-95 flex items-center justify-center min-h-[44px] ${
                    isSelected
                      ? 'bg-[#2DD4BF]/20 border-[#2DD4BF] text-[#2DD4BF] shadow-[0_0_15px_rgba(45,212,191,0.15)]'
                      : 'bg-white/5 border-white/5 text-gray-300 hover:text-white hover:border-white/10 hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* CAMPOS DINÂMICOS CONFORME A CATEGORIA SELECIONADA */}

        {category === 'Agendamento' && (
          <>
            {/* Assunto */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Assunto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Consulta Médica de Rotina"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 focus:ring-1 focus:ring-[#2DD4BF]/30 transition placeholder-gray-500 min-h-[48px]"
              />
            </div>

            {/* E-mail */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                E-mail *
              </label>
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder="Ex: paciente@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 focus:ring-1 focus:ring-[#2DD4BF]/30 transition placeholder-gray-500 min-h-[48px]"
              />
            </div>

            {/* Hora */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Hora *
              </label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-1.5 focus-within:border-[#2DD4BF]/50 min-h-[48px]">
                <Clock className="text-gray-400 mr-2" size={18} />
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer text-left py-2"
                />
              </div>
            </div>
          </>
        )}

        {category === 'Curinga' && (
          <>
            {/* Nome da paciente */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Nome da paciente *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Fabiana Ramos"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 focus:ring-1 focus:ring-[#2DD4BF]/30 transition placeholder-gray-500 min-h-[48px]"
              />
            </div>

          </>
        )}

        {category === 'Disponível' && (
          <>
            {/* Nome da profissional */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Nome da profissional *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Dra. Viviane Albuquerque"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 focus:ring-1 focus:ring-[#2DD4BF]/30 transition placeholder-gray-500 min-h-[48px]"
              />
            </div>
          </>
        )}

        {category === 'Notas' && (
          <>
            {/* Assunto */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Assunto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Observações do prontuário"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 focus:ring-1 focus:ring-[#2DD4BF]/30 transition placeholder-gray-500 min-h-[48px]"
              />
            </div>

            {/* [Texto] */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                [Texto] *
              </label>
              <textarea
                required
                placeholder="Digite a observação completa..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]/55 h-28 resize-none transition placeholder-gray-500"
              />
            </div>
          </>
        )}

        {/* Data de Vencimento */}
        <div className="space-y-2">
          <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
            Data de Execução *
          </label>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-1.5 focus-within:border-[#2DD4BF]/50 min-h-[48px]">
            <Calendar className="text-gray-400 mr-2" size={18} />
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer py-2"
            />
          </div>
        </div>

        {/* Escolha da Prioridade */}
        <div className="space-y-2">
          <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block mb-1">
            Nível de Prioridade
          </label>
          <div className="grid grid-cols-3 gap-3">
            {priorities.map((prio) => {
              const isSelected = priority === prio;
              let activeClass = '';

              if (isSelected) {
                if (prio === 'Alta') activeClass = 'bg-rose-500/15 border-rose-500 text-rose-400 font-bold shadow-[0_0_12px_rgba(244,63,94,0.15)]';
                else if (prio === 'Média') activeClass = 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.15)]';
                else activeClass = 'bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)]';
              }

              return (
                <button
                  type="button"
                  key={prio}
                  onClick={() => setPriority(prio)}
                  className={`py-3.5 rounded-2xl text-sm font-semibold border transition text-center cursor-pointer active:scale-95 min-h-[44px] flex items-center justify-center ${
                    isSelected ? activeClass : 'bg-white/5 border-white/5 text-gray-300 hover:border-white/10 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {prio}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sincronização de Agenda */}
        <div className="glass border border-white/10 rounded-2xl p-4 space-y-3 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="text-[#2DD4BF]" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider text-white">Google Agenda</span>
            </div>
            {googleUser ? (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono border border-emerald-500/20">
                Conectado
              </span>
            ) : (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-mono border border-amber-500/20">
                Sincronização Desligada
              </span>
            )}
          </div>

          {googleUser ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-300 leading-snug">
                Conectado como <span className="text-white font-semibold font-mono">{googleUser.email}</span>. Suas novas tarefas serão marcadas no calendário.
              </p>
              
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2.5 cursor-pointer text-sm text-gray-200 select-none min-h-[44px] py-1">
                  <input
                    type="checkbox"
                    checked={syncGoogle}
                    onChange={(e) => setSyncGoogle(e.target.checked)}
                    className="rounded accent-[#2DD4BF] focus:ring-0 cursor-pointer w-5 h-5 bg-transparent border-white/20 text-[#2DD4BF]"
                  />
                  <span>Agendar no Google Calendar</span>
                </label>
                
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="text-xs text-gray-300 hover:text-red-400 transition underline cursor-pointer hover:no-underline min-h-[44px] px-2 flex items-center"
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-300 leading-snug">
                Sincronize com a sua conta Google para criar compromissos diretamente no calendário oficial.
              </p>
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="w-full py-3.5 rounded-2xl border border-white/10 bg-white/5 text-xs text-[#2DD4BF] hover:bg-[#2DD4BF]/10 transition flex items-center justify-center gap-2 font-bold cursor-pointer hover:border-[#2DD4BF]/20 min-h-[44px] active:scale-95"
              >
                Conectar Conta Google
              </button>
            </div>
          )}

          {isSyncing && (
            <div className="text-xs text-[#2DD4BF] flex items-center gap-2 font-mono pt-1 animate-pulse min-h-[44px]">
              <RefreshCw size={12} className="animate-spin" />
              Sincronizando compromisso no Google Agenda...
            </div>
          )}

          {syncError && (
            <p className="text-[10px] text-amber-400 leading-snug font-mono bg-amber-500/5 p-1.5 rounded border border-amber-500/10">{syncError}</p>
          )}
        </div>

        {/* Botão de Envio */}
        <button
          type="submit"
          disabled={isSyncing}
          className="w-full bg-[#2DD4BF] disabled:bg-gray-700 hover:bg-[#20bda8] text-black text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition active:scale-95 shadow-[0_4px_15px_rgba(45,212,191,0.15)] mt-4 cursor-pointer disabled:cursor-not-allowed min-h-[48px]"
        >
          {isSyncing ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Sincronizando e Salvando...</span>
            </>
          ) : (
            <>
              <PlusCircle size={18} />
              <span>Confirmar e Agendar Tarefa</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
