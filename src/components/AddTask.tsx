import React, { useState } from 'react';
import { PlusCircle, Clock, Calendar, Check, AlertCircle, LayoutGrid, CheckCircle, RefreshCw } from 'lucide-react';
import { Task, TaskCategory, Priority, TaskStatus } from '../types';
import { createGoogleCalendarEvent } from '../googleAuth';

interface AddTaskProps {
  activeDate: string;
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'status' | 'actualMinutes'> & { status?: TaskStatus }) => Promise<void> | void;
  onChangeTab: (tab: 'dashboard' | 'tasks' | 'add' | 'timer') => void;
  googleUser: any;
  googleToken: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onTriggerToast?: (msg: string) => void;
}

export default function AddTask({
  activeDate,
  onAddTask,
  onChangeTab,
  googleUser,
  googleToken,
  onGoogleSignIn,
  onGoogleSignOut,
  onTriggerToast
}: AddTaskProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Agendamento');
  const [date, setDate] = useState(activeDate);
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [alertSuccess, setAlertSuccess] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ title: string; category: TaskCategory } | null>(null);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Pendente');
  const [time, setTime] = useState('');

  const [syncGoogle, setSyncGoogle] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const categories: TaskCategory[] = ['Agendamento', 'Curinga', 'Disponível', 'Notas'];
  const presetMinutes = [15, 25, 45, 60, 90];

  const isSubmittingRef = React.useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Captura os dados atuais do formulário antes de limpá-los para disponibilizar no modal de sucesso
    const savedTitle = title.trim();
    const savedCategory = category;
    const savedDesc = description.trim();
    const savedEmail = email.trim();
    const savedTime = time;
    const savedDate = date;
    const savedEstimated = estimatedMinutes;
    const savedStatus = status;

    // Define imediatamente o estado de "Salvo com Sucesso!" para feedback instantâneo após o clique
    setLastCreated({ title: savedTitle, category: savedCategory });
    setAlertSuccess(true);

    // Limpa imediatamente todos os campos do formulário para dar sensação de envio instantâneo
    setTitle('');
    setDescription('');
    setEmail('');
    setTime('');
    setStatus('Pendente');

    // Executa e aguarda a gravação no Firestore e o Google Agenda de forma assíncrona em segundo plano
    (async () => {
      let googleEventId: string | undefined;
      let googleEventLink: string | undefined;
      let googleMeetLink: string | undefined;

      const eventDesc = savedCategory === 'Agendamento'
        ? `E-mail: ${savedEmail}`
        : savedCategory === 'Notas'
        ? savedDesc
        : '';

      try {
        if (syncGoogle && googleToken && savedCategory === 'Agendamento') {
          setIsSyncing(true);
          setSyncError(null);
          try {
            const eventRes = await createGoogleCalendarEvent(googleToken, {
              title: savedTitle,
              description: eventDesc,
              date: savedDate,
              time: savedTime ? savedTime : undefined,
              category: savedCategory,
              priority: 'Média',
              estimatedMinutes: savedEstimated,
              email: savedEmail ? savedEmail : undefined
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

        await onAddTask({
          title: savedTitle,
          description: savedCategory === 'Notas' ? savedDesc : undefined,
          category: savedCategory,
          priority: 'Média',
          status: savedStatus,
          date: savedDate,
          time: savedCategory === 'Agendamento' && savedTime ? savedTime : undefined,
          estimatedMinutes: savedEstimated,
          googleEventId,
          googleEventLink,
          googleMeetLink,
          email: savedCategory === 'Agendamento' ? savedEmail : undefined
        });
      } catch (err) {
        console.error('Error in background task submission:', err);
      }
    })();
  };

  const handleCreateAnother = () => {
    setAlertSuccess(false);
    setLastCreated(null);
    isSubmittingRef.current = false;
  };

  const handleGoToAgenda = () => {
    setAlertSuccess(false);
    setLastCreated(null);
    isSubmittingRef.current = false;
    onChangeTab('dashboard');
  };

  if (alertSuccess && lastCreated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center space-y-6" id="success_inline_container">
        <div className="w-20 h-20 rounded-full bg-[#2DD4BF]/10 flex items-center justify-center text-[#2DD4BF] border border-[#2DD4BF]/20 animate-bounce">
          <CheckCircle size={48} className="text-[#2DD4BF]" />
        </div>
        
        <div>
          <h3 className="text-2xl font-extrabold text-white mb-2">Operação Realizada!</h3>
          <p className="text-sm text-gray-300 max-w-sm mx-auto leading-relaxed">
            {lastCreated.category === 'Agendamento' && (
              <span>O agendamento de <strong className="text-white">"{lastCreated.title}"</strong> foi gerado e salvo no cronograma diário.</span>
            )}
            {lastCreated.category === 'Disponível' && (
              <span>A disponibilidade de <strong className="text-white">"{lastCreated.title}"</strong> foi registrada com sucesso.</span>
            )}
            {lastCreated.category === 'Curinga' && (
              <span>O paciente Curinga <strong className="text-white">"{lastCreated.title}"</strong> foi adicionado com sucesso.</span>
            )}
            {lastCreated.category === 'Notas' && (
              <span>A anotação <strong className="text-[#2DD4BF]">"{lastCreated.title}"</strong> foi guardada no histórico.</span>
            )}
          </p>
        </div>

        <div className="w-full max-w-xs space-y-3 pt-4 font-sans">
          <button
            type="button"
            id="success_btn_agenda"
            onClick={handleGoToAgenda}
            className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] text-black text-sm font-bold py-4 rounded-2xl transition active:scale-95 cursor-pointer flex items-center justify-center shadow-[0_4px_15px_rgba(45,212,191,0.15)] outline-none min-h-[48px]"
          >
            Visualizar na Agenda
          </button>
          
          <button
            type="button"
            id="success_btn_another"
            onClick={handleCreateAnother}
            className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-semibold py-3.5 rounded-2xl transition active:scale-95 cursor-pointer flex items-center justify-center min-h-[48px]"
          >
            Criar Outra Atividade
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col space-y-6 pb-24">
      {/* TÍTULO DA SEÇÃO */}
      <section className="px-2">
        <h2 className="text-4xl font-extrabold uppercase leading-[0.9] tracking-tighter mb-1 text-white">
          Nova<br/>Tarefa
        </h2>
        <p className="text-gray-300 text-sm">Inscreva uma nova atividade operacional</p>
      </section>

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

            {/* Texto */}
            <div className="space-y-2">
              <label className="text-gray-300 text-xs font-bold tracking-widest uppercase block">
                Texto *
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

        {/* Hora (somente para agendamento) */}
        {category === 'Agendamento' && (
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

        {/* Sincronização de Agenda */}
        {category === 'Agendamento' ? (
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
                  Conectado como <span className="text-white font-semibold font-mono">{googleUser.email}</span>. Este agendamento será marcado no seu calendário.
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
        ) : (
          <div className="bg-white/[0.02] text-gray-400 text-xs text-center py-4 px-4 border border-white/5 rounded-2xl">
            Sincronização com o Google Agenda disponível exclusivamente para a categoria <span className="text-[#2DD4BF] font-semibold">Agendamento</span>.
          </div>
        )}

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
