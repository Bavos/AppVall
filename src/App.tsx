import React, { useState, useEffect } from 'react';
import { Calendar, Grid, PlusSquare, LogOut, RefreshCw, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Task, ViewTab, FocusSession, TaskStatus } from './types';
import { DEFAULT_TASKS, getTodayDateString } from './utils';
import Dashboard from './components/Dashboard';
import TaskCenter from './components/TaskCenter';
import AddTask from './components/AddTask';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import { User, onAuthStateChanged } from 'firebase/auth';
import { initAuth, googleSignIn, logoutGoogle, deleteGoogleCalendarEvent, db, handleFirestoreError, OperationType, cleanUndefined, auth } from './googleAuth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocFromServer } from 'firebase/firestore';
import { useTenant } from './context/TenantContext';
import MemberManagement from './components/tenant/MemberManagement';
import InviteRescue from './components/tenant/InviteRescue';

export default function App() {
  const { organizationId, createOrganization, role } = useTenant();
  const [customPath, setCustomPath] = useState('/members');

  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(() => {
    const saved = localStorage.getItem('vall_current_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [activeDate, setActiveDate] = useState<string>(getTodayDateString()); // Data de referência iniciada conforme layout
  const [selectedTaskForFocus, setSelectedTaskForFocus] = useState<Task | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [googleUser, setGoogleUser] = useState<any>(() => {
    const email = localStorage.getItem('vall_google_email');
    if (email) {
      return {
        email,
        displayName: localStorage.getItem('vall_google_name') || 'Usuário Google'
      };
    }
    return null;
  });
  const [googleToken, setGoogleToken] = useState<string | null>(() => {
    return localStorage.getItem('vall_google_token');
  });

  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    
    const originalPushState = window.history.pushState;
    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };
    
    const originalReplaceState = window.history.replaceState;
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  // Initial bootstrap: load tasks and sessions from localStorage as reliable local cache
  useEffect(() => {
    const storedTasks = localStorage.getItem('vall_tasks');
    if (storedTasks) {
      try {
        setTasks(JSON.parse(storedTasks));
      } catch (e) {
        setTasks(DEFAULT_TASKS);
      }
    } else {
      setTasks(DEFAULT_TASKS);
      localStorage.setItem('vall_tasks', JSON.stringify(DEFAULT_TASKS));
    }

    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const storedSessions = localStorage.getItem('vall_sessions');
    if (storedSessions) {
      try {
        setFocusSessions(JSON.parse(storedSessions));
      } catch (e) {
        setFocusSessions([]);
      }
    }

    // Instancia o fluxo do Google Auth
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        setFirebaseUser(user);
      },
      () => {
        // Prevent clearing state during initial Firebase loads/refreshes if we have a cached Google token
        const hasToken = localStorage.getItem('vall_google_token');
        if (!hasToken) {
          setGoogleUser(null);
          setGoogleToken(null);
        }
      }
    );

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);



  // Cache current tasks state to localStorage for local durability
  useEffect(() => {
    if (currentUser && tasks.length > 0) {
      localStorage.setItem('vall_tasks', JSON.stringify(tasks));
    }
  }, [tasks, currentUser]);

  // Sync tasks in real-time from Firestore when currentUser and authenticated firebaseUser are present
  useEffect(() => {
    if (!currentUser) {
      setTasks([]);
      return;
    }

    // Only set up real-time listener if we have a valid, authenticated Firebase Auth user session
    // to satisfy "Only attach onSnapshot listeners if auth is ready and user is authenticated"
    if (!firebaseUser || !firebaseUser.uid) {
      return;
    }

    const emailToFilter = currentUser.email.toLowerCase();
    const tasksCollectionRef = collection(db, 'tasks');
    const q = query(tasksCollectionRef, where('userEmail', '==', emailToFilter));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedTasks: Task[] = [];
      snapshot.forEach((docSnap) => {
        fetchedTasks.push(docSnap.data() as Task);
      });

      // Seeding: if empty collection, auto-seed with customized DEFAULT_TASKS for excellent UX
      if (snapshot.empty) {
        for (let i = 0; i < DEFAULT_TASKS.length; i++) {
          const t = DEFAULT_TASKS[i];
          const taskId = `task-${Date.now()}-${i}`;
          const seeded: Task = {
            ...t,
            id: taskId,
            userEmail: emailToFilter,
            createdAt: new Date().toISOString()
          };
          try {
            await setDoc(doc(db, 'tasks', taskId), cleanUndefined(seeded));
          } catch (e) {
            console.error('Falha ao semear tarefa padrão:', e);
          }
        }
        return;
      }

      // Ordena por data de criação de forma decrescente
      fetchedTasks.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      setTasks(fetchedTasks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    return () => unsubscribe();
  }, [currentUser, firebaseUser]);

  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        triggerToast('Google Agenda conectada!');

        // Safe migration: upload any local-only tasks created offline/disconnected to Firestore 
        const emailToFilter = currentUser?.email.toLowerCase() || 'renatobz@gmail.com';
        const localTasksRaw = localStorage.getItem('vall_tasks');
        if (localTasksRaw) {
          try {
            const localTasks: Task[] = JSON.parse(localTasksRaw);
            const tasksToMigrate = localTasks.filter(t => t.userEmail === emailToFilter || !t.userEmail);
            for (const t of tasksToMigrate) {
              const migratedTask = {
                ...t,
                userEmail: emailToFilter
              };
              await setDoc(doc(db, 'tasks', t.id), cleanUndefined(migratedTask));
            }
          } catch (migrateErr) {
            console.error('Failed to migrate local tasks to firestore during sign in:', migrateErr);
          }
        }
      }
    } catch (e) {
      console.error(e);
      triggerToast('Erro ao conectar com Google.');
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logoutGoogle();
      setGoogleUser(null);
      setGoogleToken(null);
      triggerToast('Google Agenda desconectada.');
    } catch (e) {
      console.error(e);
      triggerToast('Erro ao desconectar Google.');
    }
  };

  // helper para disparar toasts elegantes
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Alterna status da tarefa (Pendente -> Em Progresso -> Concluída)
  const handleToggleStatus = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    let nextStatus = task.status;
    if (task.status === 'Pendente') nextStatus = 'Em Progresso';
    else if (task.status === 'Em Progresso') nextStatus = 'Concluída';
    else nextStatus = 'Pendente';

    const updatedTask = { ...task, status: nextStatus };

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', id), cleanUndefined(updatedTask));
        triggerToast(`Status alterado para "${nextStatus}"`);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${id}`);
        triggerToast('Erro ao alterar status no banco de dados.');
      }
    } else {
      setTasks((prevTasks) => {
        const updated = prevTasks.map((t) => (t.id === id ? updatedTask : t));
        localStorage.setItem('vall_tasks', JSON.stringify(updated));
        return updated;
      });
      triggerToast(`Status alterado para "${nextStatus}"`);
    }
  };

  // Excluir tarefa do repositório
  const handleDeleteTask = async (id: string) => {
    const taskToDelete = tasks.find((t) => t.id === id);

    if (firebaseUser && firebaseUser.uid) {
      try {
        await deleteDoc(doc(db, 'tasks', id));
        triggerToast('Tarefa removida do banco de dados');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
        triggerToast('Erro ao excluir tarefa do banco.');
        return;
      }
    } else {
      setTasks((prevTasks) => {
        const updated = prevTasks.filter((t) => t.id !== id);
        localStorage.setItem('vall_tasks', JSON.stringify(updated));
        return updated;
      });
      triggerToast('Tarefa removida do painel');
    }

    if (taskToDelete && taskToDelete.googleEventId && googleToken) {
      triggerToast('Cancelando compromisso no Google Agenda...');
      try {
        await deleteGoogleCalendarEvent(googleToken, taskToDelete.googleEventId);
        triggerToast('Tarefa e agendamento da agenda excluídos para sempre!');
      } catch (err) {
        console.error('Falha ao excluir compromisso do Google Agenda:', err);
        triggerToast('Tarefa removida. Mas não pôde ser limpa do Google Agenda.');
      }
    }
  };

  // Atualizar dados de uma tarefa existente
  const handleUpdateTask = async (updatedTask: Task, isSilent: boolean = false) => {
    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', updatedTask.id), cleanUndefined(updatedTask));
        if (!isSilent) {
          triggerToast('Alterações gravadas com sucesso');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${updatedTask.id}`);
        if (!isSilent) {
          triggerToast('Erro ao gravar alterações no banco.');
        }
      }
    } else {
      setTasks((prevTasks) => {
        const updated = prevTasks.map((t) => (t.id === updatedTask.id ? updatedTask : t));
        localStorage.setItem('vall_tasks', JSON.stringify(updated));
        return updated;
      });
      if (!isSilent) {
        triggerToast('Alterações gravadas com sucesso');
      }
    }
  };

  // Adicionar nova tarefa
  const handleAddTask = async (newTaskData: Omit<Task, 'id' | 'createdAt' | 'status' | 'actualMinutes'> & { status?: TaskStatus }) => {
    const taskId = `task-${Date.now()}`;
    const newTask: Task = {
      ...newTaskData,
      id: taskId,
      status: newTaskData.status || 'Pendente',
      actualMinutes: 0,
      createdAt: new Date().toISOString(),
      userEmail: currentUser?.email.toLowerCase() || 'renatobz@gmail.com'
    };

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', taskId), cleanUndefined(newTask));
        triggerToast('Nova tarefa agendada');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
        triggerToast('Erro ao agendar nova tarefa no banco.');
      }
    } else {
      setTasks((prevTasks) => {
        const updated = [newTask, ...prevTasks];
        localStorage.setItem('vall_tasks', JSON.stringify(updated));
        return updated;
      });
      triggerToast('Nova tarefa agendada');
    }
  };

  // Incrementa tempo focado em uma tarefa
  const handleAddFocusMinutes = async (taskId: string, mins: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedTask = { ...task, actualMinutes: task.actualMinutes + mins };

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', taskId), cleanUndefined(updatedTask));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
      }
    } else {
      setTasks((prevTasks) => {
        const updated = prevTasks.map((t) => (t.id === taskId ? updatedTask : t));
        localStorage.setItem('vall_tasks', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Salva uma nova sessão de foco Pomodoro no histórico
  const handleSaveFocusSession = (session: FocusSession) => {
    const updated = [session, ...focusSessions];
    setFocusSessions(updated);
    localStorage.setItem('vall_sessions', JSON.stringify(updated));
  };

  // Logout com feedback elegante e limpeza do Firebase Auth
  const handleLogout = async () => {
    const userName = currentUser?.name || 'Renato Zarvos';
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('Silent sign out warning:', e);
    }
    setCurrentUser(null);
    localStorage.removeItem('vall_current_user');
    // Clear Google token as well
    localStorage.removeItem('vall_google_token');
    localStorage.removeItem('vall_google_email');
    localStorage.removeItem('vall_google_name');
    setGoogleUser(null);
    setGoogleToken(null);
    setFirebaseUser(null);
    triggerToast(`Até logo, ${userName}! Painel fechado de forma segura.`);
  };

  const handleLoginSuccess = (user: { name: string; email: string }) => {
    setCurrentUser(user);
    localStorage.setItem('vall_current_user', JSON.stringify(user));
    triggerToast(`Bem-vindo, ${user.name}!`);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (currentPath === '/reset-password') {
    return (
      <div className="min-h-screen bg-[#030712] text-[#f8fafc] font-sans flex flex-col max-w-md mx-auto border-x border-white/5 shadow-2xl relative select-none overflow-hidden justify-center pb-12">
        {toastMessage && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 glass backdrop-blur-xl bg-black/40 text-xs px-4 py-3 rounded-full text-white shadow-xl flex items-center space-x-2 font-mono border-white/10" id="app_toast">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-ping" />
            <span className="text-gray-200">{toastMessage}</span>
          </div>
        )}
        <ResetPassword onBackToLogin={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
        }} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#030712] text-[#f8fafc] font-sans flex flex-col max-w-md mx-auto border-x border-white/5 shadow-2xl relative select-none overflow-hidden">
        {toastMessage && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 glass backdrop-blur-xl bg-black/40 text-xs px-4 py-3 rounded-full text-white shadow-xl flex items-center space-x-2 font-mono border-white/10" id="app_toast">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-ping" />
            <span className="text-gray-200">{toastMessage}</span>
          </div>
        )}
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-[#f8fafc] font-sans flex flex-col max-w-md mx-auto border-x border-white/5 shadow-2xl relative select-none overflow-hidden">
      
      {/* BACKGROUND MESH GLOWS */}
      <div className="mesh-bg opacity-75" />

      {/* TOAST NOTIFICAÇÃO ELEGANTE */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 glass backdrop-blur-xl bg-black/40 text-xs px-4 py-3 rounded-full text-white shadow-xl flex items-center space-x-2 font-mono border-white/10" id="app_toast">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-ping" />
          <span className="text-gray-200">{toastMessage}</span>
        </div>
      )}

      {/* 1. CABEÇALHO (Header) */}
      <header className="p-6 flex justify-between items-start relative z-10" id="app_header">
        <div>
          <p className="text-[#2DD4BF] text-[10px] tracking-[0.25em] font-bold mb-1 uppercase font-mono">
            Sistema de Gestão
          </p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2DD4BF] rounded-lg flex items-center justify-center font-black text-black text-lg italic select-none">V</div>
            <h1 className="text-3xl font-black italic tracking-tighter uppercase text-white select-none">Vall</h1>
          </div>
        </div>
        <div className="flex space-x-3 mt-1">
          <div 
            title={`Usuário Logado: ${currentUser.name} (${currentUser.email})`}
            className="w-10 h-10 rounded-full bg-[#2DD4BF] text-black font-extrabold text-sm flex items-center justify-center shadow-[0_0_15px_rgba(45,212,191,0.2)]"
          >
            {getInitials(currentUser.name)}
          </div>
          <button 
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition active:scale-95 cursor-pointer"
            title="Desconectar do painel"
            id="btn_logout"
          >
            <LogOut size={16} className="text-gray-300" />
          </button>
        </div>
      </header>

      {/* VIEW PRINCIPAL DINÂMICA */}
      <main className="flex-1 px-4 overflow-y-auto relative z-10" id="app_main_content">
        {activeTab === 'dashboard' && (
          <Dashboard
            tasks={tasks}
            activeDate={activeDate}
            onToggleStatus={handleToggleStatus}
            onAddTaskTab={() => setActiveTab('add')}
            userName={currentUser.name}
          />
        )}

        {activeTab === 'tasks' && (
          <TaskCenter
            tasks={tasks}
            activeDate={activeDate}
            setActiveDate={setActiveDate}
            onToggleStatus={handleToggleStatus}
            onDeleteTask={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            googleUser={googleUser}
            googleToken={googleToken}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onTriggerToast={triggerToast}
          />
        )}

        {activeTab === 'add' && (
          <AddTask
            activeDate={activeDate}
            onAddTask={handleAddTask}
            onChangeTab={setActiveTab}
            googleUser={googleUser}
            googleToken={googleToken}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
          />
        )}

        {activeTab === 'tenant' && (
          <div className="space-y-6 pb-24 max-w-4xl mx-auto animate-fade-in relative z-15">
            {!organizationId ? (
              <div className="bg-neutral-900 border border-white/5 rounded-[2.5rem] p-8 max-w-md mx-auto space-y-6 text-center shadow-xl">
                <div className="inline-flex items-center justify-center bg-[#2DD4BF]/10 w-16 h-16 rounded-[2rem] text-[#2DD4BF] border border-[#2DD4BF]/20">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">Criar Organização SaaS</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Você ainda não se vinculou a um Tenant. Crie sua Organização e assuma o controle total como Administrador.
                  </p>
                </div>
                
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const name = String(formData.get('orgName') || '').trim();
                    if (!name) return;
                    try {
                      await createOrganization(name);
                      triggerToast(`Organização "${name}" criada com sucesso!`);
                    } catch (err: any) {
                      triggerToast('Erro ao criar organização.');
                    }
                  }}
                  className="space-y-4"
                >
                  <input
                    type="text"
                    name="orgName"
                    required
                    placeholder="Nome da Organização (ex: Acmee Corp)"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] transition"
                  />
                  <button
                    type="submit"
                    className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] text-black font-extrabold text-sm py-4 rounded-2xl transition active:scale-95 cursor-pointer"
                  >
                    Bootstrap Organização
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Visual simulator for invite redemption vs member list */}
                <div className="flex bg-neutral-950/40 p-1.5 border border-white/5 rounded-2xl gap-2 font-mono">
                  <button
                    onClick={() => setCustomPath('/members')}
                    className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-bold transition uppercase tracking-wider ${
                      customPath === '/members' ? 'bg-[#2DD4BF] text-black shadow-md' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Membros & Permissões
                  </button>
                  <button
                    onClick={() => setCustomPath('/rescue')}
                    className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-bold transition uppercase tracking-wider ${
                      customPath === '/rescue' ? 'bg-[#2DD4BF] text-black shadow-md' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Simular Convite
                  </button>
                </div>
                {customPath === '/members' ? <MemberManagement /> : <InviteRescue />}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. BARRA DE NAVEGAÇÃO INFERIOR ESTILIZADA (Bottom Nav) */}
      <nav 
        className="glass p-2 m-4 rounded-[2rem] flex justify-between items-center fixed bottom-0 left-1/2 transform -translate-x-1/2 w-[calc(100%-2rem)] max-w-[calc(26rem-2rem)] z-30 shadow-2xl border border-white/20 select-none animate-fade-in"
        id="app_bottom_nav"
      >
         {/* Grid: Painel Geral/Dashboard */}
         <button 
           onClick={() => {
             setActiveTab('dashboard');
             setSelectedTaskForFocus(null);
           }}
           id="nav_btn_dashboard"
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
             activeTab === 'dashboard'
               ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
               : 'text-gray-300 hover:text-white hover:bg-white/10'
           }`}
           title="Painel Geral"
         >
           <Grid size={20} />
         </button>
         
         {/* Calendário: Gerenciamento de tarefas */}
         <button 
           onClick={() => {
             setActiveTab('tasks');
             setSelectedTaskForFocus(null);
           }}
           id="nav_btn_tasks"
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
             activeTab === 'tasks'
               ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
               : 'text-gray-300 hover:text-white hover:bg-white/10'
           }`}
           title="Tarefas & Calendário"
         >
           <Calendar size={20} />
         </button>

         {/* PlusSquare: Criar Nova Tarefa */}
         <button 
           onClick={() => {
             setActiveTab('add');
             setSelectedTaskForFocus(null);
           }}
           id="nav_btn_add"
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
             activeTab === 'add'
               ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
               : 'text-gray-300 hover:text-white hover:bg-white/10'
           }`}
           title="Nova Tarefa"
         >
           <PlusSquare size={20} />
         </button>

         {/* ShieldCheck: SaaS Tenant Portal */}
         <button 
           onClick={() => {
             setActiveTab('tenant');
             setSelectedTaskForFocus(null);
           }}
           id="nav_btn_tenant"
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
             activeTab === 'tenant'
               ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
               : 'text-gray-300 hover:text-white hover:bg-white/10'
           }`}
           title="SaaS Cooperativo"
         >
           <ShieldCheck size={20} />
         </button>


      </nav>

    </div>
  );
}
