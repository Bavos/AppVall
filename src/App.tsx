import React, { useState, useEffect } from 'react';
import { Calendar, Grid, PlusSquare, LogOut, RefreshCw, Sparkles, CheckCircle2, FileText, X, Users, Wifi, WifiOff } from 'lucide-react';
import { Task, ViewTab, FocusSession, TaskStatus } from './types';
import { DEFAULT_TASKS, getTodayDateString, formatToRelativeDate } from './utils';
import Dashboard from './components/Dashboard';
import TaskCenter from './components/TaskCenter';
import AddTask from './components/AddTask';
import RelatorioUI from './components/RelatorioUI';
import Gerenciamento from './components/Gerenciamento';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import { User, onAuthStateChanged } from 'firebase/auth';
import { initAuth, googleSignIn, logoutGoogle, deleteGoogleCalendarEvent, db, handleFirestoreError, OperationType, cleanUndefined, auth, registerTokenExpiredCallback, getGoogleCalendarEventRSVP } from './googleAuth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocFromServer, getDocs } from 'firebase/firestore';

export default function App() {
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
  const [userProfile, setUserProfile] = useState<{
    email: string;
    name: string;
    role: 'admin' | 'member';
    adminEmail: string;
    password?: string;
    createdAt: string;
    dailyReportConfig?: {
      enabled: boolean;
      email: string;
      sendTime?: string;
      lastSentDate?: string;
    };
  } | null>(() => {
    const saved = localStorage.getItem('vall_user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [activeDate, setActiveDate] = useState<string>(getTodayDateString()); // Data de referência iniciada conforme layout
  const [selectedTaskForFocus, setSelectedTaskForFocus] = useState<Task | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isFromCache, setIsFromCache] = useState(false);

  // Monitoramento de conexão da rede (online/offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerToast('Conexão restabelecida! Banco de dados sincronizado.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      triggerToast('Você está offline. Alterações salvas em cache local.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listener de 'window focus' e 'visibilitychange' para re-sincronizar dados em tempo real
  useEffect(() => {
    const handleFocus = () => {
      console.log('[Sincronização] O app ganhou foco. Forçando re-sincronização de dados...');
      setFocusTrigger(prev => prev + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
        console.warn("Firestore connection check info:", error instanceof Error ? error.message : error);
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

    registerTokenExpiredCallback(() => {
      setGoogleUser(null);
      setGoogleToken(null);
      triggerToast('Sua conexão com o Google Agenda expirou. Por favor, reconecte clicando em "Google Agenda (Desconectada)".');
    });

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

  // Autocheck RSVP globally for tasks of the active date on load/transition to keep statuses fresh automatically
  useEffect(() => {
    if (!googleToken) return;
    const activeDateTasks = tasks.filter(t => t.date === activeDate && t.googleEventId);
    if (activeDateTasks.length === 0) return;

    const timer = setTimeout(() => {
      const autoCheck = async () => {
        for (const task of activeDateTasks) {
          try {
            const attendeeEmail = task.email || googleUser?.email || currentUser?.email || '';
            const rsvpData = await getGoogleCalendarEventRSVP(googleToken, task.googleEventId!, attendeeEmail);
            if (rsvpData) {
              let updatedStatus = task.status;
              if (rsvpData.rsvpStatus === 'accepted' && task.status === 'Pendente') {
                updatedStatus = 'Em Progresso';
              } else if (rsvpData.rsvpStatus === 'declined' && task.status === 'Em Progresso') {
                updatedStatus = 'Pendente';
              }
              if (task.rsvpStatus !== rsvpData.rsvpStatus || task.status !== updatedStatus || rsvpData.hangoutLink !== task.googleMeetLink) {
                await handleUpdateTask({
                  ...task,
                  rsvpStatus: rsvpData.rsvpStatus,
                  googleMeetLink: rsvpData.hangoutLink || task.googleMeetLink,
                  status: updatedStatus
                }, true); // silent update
              }
            }
          } catch (err: any) {
            console.error('Global auto RSVP check failed:', err);
          }
        }
      };
      autoCheck();
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeDate, googleToken, tasks.length]);

  // Sync user profiles in real-time from Firestore when authenticated
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.email) {
      // Load fallback profile if logged in locally so current profile isn't wiped out
      const saved = localStorage.getItem('vall_user_profile');
      if (saved) {
        try {
          setUserProfile(JSON.parse(saved));
        } catch (e) {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      return;
    }

    const emailLower = firebaseUser.email.toLowerCase();
    const profileRef = doc(db, 'user_profiles', emailLower);
    
    const unsubscribe = onSnapshot(profileRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const prof = {
          email: data.email,
          name: data.name,
          role: data.role as 'admin' | 'member',
          adminEmail: data.adminEmail,
          password: data.password,
          createdAt: data.createdAt,
          dailyReportConfig: data.dailyReportConfig
        };
        setUserProfile(prof);
        localStorage.setItem('vall_user_profile', JSON.stringify(prof));
      } else {
        // If profile does not exist yet (Google signin, legacy login, or new unprofiled admin), auto provision
        try {
          const newProfile = {
            email: emailLower,
            name: firebaseUser.displayName || 'Administrador',
            role: 'admin' as const,
            adminEmail: emailLower,
            createdAt: new Date().toISOString()
          };
          await setDoc(profileRef, newProfile);
          setUserProfile(newProfile);
          localStorage.setItem('vall_user_profile', JSON.stringify(newProfile));
        } catch (err) {
          console.error('Falha ao auto-provisionar perfil do usuário:', err);
          // Auto provision fallback locally
          const localProfile = {
            email: emailLower,
            name: firebaseUser.displayName || 'Administrador',
            role: 'admin' as const,
            adminEmail: emailLower,
            createdAt: new Date().toISOString()
          };
          setUserProfile(localProfile);
          localStorage.setItem('vall_user_profile', JSON.stringify(localProfile));
        }
      }
    }, (error) => {
      console.warn('Erro ao ler perfil do Firestore:', error);
      triggerToast('Avisamos que a conexão ao banco está instável. Carregando perfil local.');
    });

    return () => unsubscribe();
  }, [firebaseUser]);

  // Self-healing migration for tasks that were incorrectly saved with a member's email as adminEmail
  useEffect(() => {
    if (!userProfile || !userProfile.adminEmail) return;

    const emailToFilter = userProfile.email.toLowerCase();
    const correctAdminEmail = userProfile.adminEmail.toLowerCase();

    // Only run if the member is in an admin group and their profile is completed
    if (userProfile.role === 'member' && emailToFilter !== correctAdminEmail) {
      const runSelfHealing = async () => {
        try {
          const tasksCollectionRef = collection(db, 'tasks');
          // Fetch tasks created by this user where the adminEmail is wrongly set to their own email
          const qMigrate = query(
            tasksCollectionRef,
            where('userEmail', '==', emailToFilter),
            where('adminEmail', '==', emailToFilter)
          );

          const snapshot = await getDocs(qMigrate);
          if (!snapshot.empty) {
            console.log(`[Self-Healing] Encontradas ${snapshot.size} tarefas para migração de adminEmail para ${correctAdminEmail}`);
            for (const docSnap of snapshot.docs) {
              const taskData = docSnap.data();
              const updatedTask = {
                ...taskData,
                adminEmail: correctAdminEmail
              };
              await setDoc(doc(db, 'tasks', docSnap.id), cleanUndefined(updatedTask));
            }
          }
        } catch (err) {
          console.warn('[Self-Healing] Erro ao executar correções em lote de tarefas:', err);
        }
      };

      runSelfHealing();
    }
  }, [userProfile]);

  // Sync tasks in real-time from Firestore when currentUser and authenticated firebaseUser are present
  useEffect(() => {
    if (!currentUser) {
      setTasks([]);
      return;
    }

    // Only set up real-time listener if we have a valid, authenticated Firebase Auth user session
    // and the userProfile is fully loaded to satisfy security rule checks and avoid premature permission checks
    if (!firebaseUser || !firebaseUser.uid || !userProfile || !userProfile.adminEmail) {
      return;
    }

    const emailToFilter = currentUser.email.toLowerCase();
    const tasksCollectionRef = collection(db, 'tasks');
    
    // Choose collective group if profile is present, otherwise fallback to userEmail
    const adminEmailToFilter = userProfile.adminEmail.toLowerCase();

    // Sincronizar preventivamente tarefas locais com o Firestore para evitar perda de dados e deleções acidentais nas recargas de página
    const localTasksRaw = localStorage.getItem('vall_tasks');
    if (localTasksRaw) {
      try {
        const localTasks: Task[] = JSON.parse(localTasksRaw);
        
        // Se houver tarefas criadas localmente sem login real ou sob o usuário padrão 'admin@example.com',
        // nós as migramos para o novo usuário logado para garantir sincronização imediata entre laptop e celular.
        const tasksToSync = localTasks.map(t => {
          const isLocalOrUnassigned = 
            !t.adminEmail || 
            t.adminEmail === 'admin@example.com' ||
            !t.userEmail || 
            t.userEmail === 'admin@example.com' ||
            (userProfile && userProfile.role === 'member' && t.adminEmail.toLowerCase() === emailToFilter);

          if (isLocalOrUnassigned) {
            return {
              ...t,
              userEmail: t.userEmail && t.userEmail !== 'admin@example.com' ? t.userEmail : emailToFilter,
              adminEmail: adminEmailToFilter
            };
          }
          return t;
        }).filter(t => t.adminEmail === adminEmailToFilter);

        for (const t of tasksToSync) {
          setDoc(doc(db, 'tasks', t.id), cleanUndefined(t)).catch(e => {
            console.warn('Falha silenciosa ao sincronizar tarefa local:', e);
          });
        }
        
        // Atualiza o local storage com as tarefas migradas
        if (tasksToSync.length > 0) {
          localStorage.setItem('vall_tasks', JSON.stringify(tasksToSync));
        }
      } catch (err) {
        console.warn('Erro ao processar backup de tarefas locais:', err);
      }
    }

    const q = query(tasksCollectionRef, where('adminEmail', '==', adminEmailToFilter));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setIsFromCache(snapshot.metadata.fromCache);
      const fetchedTasks: Task[] = [];
      snapshot.forEach((docSnap) => {
        fetchedTasks.push(docSnap.data() as Task);
      });

      // Seeding: if empty collection AND we are not a member (only admins or solo users can seed)
      if (snapshot.empty) {
        const wasSeeded = localStorage.getItem('vall_tasks_seeded_fb');
        const canSeed = !wasSeeded && (!userProfile || userProfile.role === 'admin');
        if (canSeed) {
          localStorage.setItem('vall_tasks_seeded_fb', 'true');
          for (let i = 0; i < DEFAULT_TASKS.length; i++) {
            const t = DEFAULT_TASKS[i];
            const taskId = `task-${Date.now()}-${i}`;
            const seeded: Task = {
              ...t,
              id: taskId,
              userEmail: emailToFilter,
              createdAt: new Date().toISOString(),
              adminEmail: adminEmailToFilter
            };
            try {
              await setDoc(doc(db, 'tasks', taskId), cleanUndefined(seeded));
            } catch (e) {
              console.error('Falha ao semear tarefa padrão:', e);
            }
          }
          return;
        } else {
          // If already empty and we've already seeded, ensure UI state is actually cleared
          setTasks([]);
          localStorage.setItem('vall_tasks', JSON.stringify([]));
          return;
        }
      }

      // Self-healing migration for legacy database entries lacking adminEmail
      if (userProfile?.adminEmail) {
        for (const ft of fetchedTasks) {
          if (!ft.adminEmail) {
            try {
              await setDoc(doc(db, 'tasks', ft.id), {
                ...ft,
                adminEmail: userProfile.adminEmail.toLowerCase()
              });
            } catch (err) {
              console.warn('Silent legacy task migration failed:', err);
            }
          }
        }
      }

      // Ordena por data de criação de forma decrescente
      fetchedTasks.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      setTasks(fetchedTasks);
    }, (error) => {
      onSnapshot(query(tasksCollectionRef, where('userEmail', '==', emailToFilter)), (fallbackSnap) => {
        setIsFromCache(fallbackSnap.metadata.fromCache);
        const fetchedTasks: Task[] = [];
        fallbackSnap.forEach((docSnap) => {
          fetchedTasks.push(docSnap.data() as Task);
        });
        fetchedTasks.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
        setTasks(fetchedTasks);
      }, (fallbackError) => {
        console.warn('Fallbacks de sincronização esgotados para tarefas:', fallbackError);
        triggerToast('Sem conexão de rede para carregar novas tarefas. Exibindo cópia local cacheada.');
      });
    });

    return () => unsubscribe();
  }, [currentUser, firebaseUser, userProfile, focusTrigger]);

  // Automated background daily report checker (runs on client/browser for authentic credentials/permissions support)
  // Evaluates every 30 seconds to ensure triggering as soon as the scheduled time is reached without page reloads.
  useEffect(() => {
    if (!currentUser || !userProfile) return;
    if (userProfile.role !== 'admin') return;

    const emailLower = currentUser.email.toLowerCase().trim();

    const checkAndTrigger = async () => {
      const config = userProfile.dailyReportConfig;
      if (!config || !config.enabled) return;

      const todayBRT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (config.lastSentDate === todayBRT) {
        return;
      }

      // Check if the scheduled time (sendTime, defaulting to 08:00) has been reached/passed in Brasília Time (UTC-3)
      const sendTime = config.sendTime || '08:00';
      const [sendHour, sendMin] = sendTime.split(':').map(Number);

      const now = new Date();
      const brTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const brHour = brTime.getUTCHours();
      const brMin = brTime.getUTCMinutes();

      const sendMinutesTotal = sendHour * 60 + (sendMin || 0);
      const currentMinutesTotal = brHour * 60 + brMin;

      if (currentMinutesTotal < sendMinutesTotal) {
        console.log(`[Auto Daily Report] Scheduled time ${sendTime} is in the future. Current BRT is ${brHour.toString().padStart(2,'0')}:${brMin.toString().padStart(2,'0')}.`);
        return;
      }

      try {
        console.log('[Auto Daily Report] Client detected scheduled time ' + sendTime + ' reached (' + brHour.toString().padStart(2,'0') + ':' + brMin.toString().padStart(2,'0') + ' BRT). Executing background trigger...');
        
        // 1. Fetch current tasks on client-side (where auth is authentic to satisfy security rules query limits check)
        let tasksToSend: any[] = [];
        try {
          const tasksCol = collection(db, 'tasks');
          const q = query(tasksCol, where('adminEmail', '==', emailLower));
          const tasksSnap = await getDocs(q);
          tasksToSend = tasksSnap.docs.map(doc => doc.data());
        } catch (dbErr) {
          console.warn('[Auto Daily Report] Client query fallback in background send:', dbErr);
          const cached = localStorage.getItem('vall_tasks');
          if (cached) {
            try { tasksToSend = JSON.parse(cached); } catch (e) {}
          }
        }

        // 2. Post to endpoints securely
        const payload = {
          adminEmail: emailLower,
          destinationEmail: config.email || emailLower,
          selectedDate: todayBRT,
          tasks: tasksToSend
        };

        const response = await fetch('/api/generate-daily-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[Auto Daily Report] Successfully processed background daily report. Email status details:', data.emailRes);
          
          // Prevents future runs today by writing the sent date state to profile
          const profileRef = doc(db, 'user_profiles', emailLower);
          const updatedProf = {
            ...userProfile,
            dailyReportConfig: {
              ...config,
              lastSentDate: todayBRT
            }
          };

          await setDoc(profileRef, cleanUndefined(updatedProf));
        } else {
          console.warn('[Auto Daily Report] Remote server returned status code ' + response.status);
        }
      } catch (triggerErr) {
        console.error('[Auto Daily Report ERROR] Failed during background client trigger:', triggerErr);
      }
    };

    // Run initial trigger check after a brief start delay (5 seconds)
    const startTid = setTimeout(checkAndTrigger, 5000);

    // Keep checking every 30 seconds to support active open-tab workflows
    const intervalId = setInterval(checkAndTrigger, 30000);

    return () => {
      clearTimeout(startTid);
      clearInterval(intervalId);
    };
  }, [currentUser, userProfile]);

  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        triggerToast('Google Agenda conectada!');

        // Safe migration: upload any local-only tasks created offline/disconnected to Firestore 
        const emailToFilter = currentUser?.email.toLowerCase() || 'admin@example.com';
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

    // Update local state and localStorage immediately for a premium, snappy feel
    setTasks((prevTasks) => {
      const updated = prevTasks.filter((t) => t.id !== id);
      localStorage.setItem('vall_tasks', JSON.stringify(updated));
      return updated;
    });

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
    let finalTask = { ...updatedTask };
    if (userProfile && userProfile.adminEmail) {
      finalTask.adminEmail = userProfile.adminEmail.toLowerCase();
    }

    // Always update local state immediately
    setTasks((prevTasks) => {
      const updated = prevTasks.map((t) => (t.id === finalTask.id ? finalTask : t));
      localStorage.setItem('vall_tasks', JSON.stringify(updated));
      return updated;
    });

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', finalTask.id), cleanUndefined(finalTask));
        if (!isSilent) {
          triggerToast('Alterações gravadas com sucesso');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${finalTask.id}`);
        if (!isSilent) {
          triggerToast('Erro ao gravar alterações no banco.');
        }
      }
    } else {
      if (!isSilent) {
        triggerToast('Alterações gravadas com sucesso');
      }
    }
  };

  // Adicionar nova tarefa
  const handleAddTask = async (newTaskData: Omit<Task, 'id' | 'createdAt' | 'status' | 'actualMinutes'> & { status?: TaskStatus }) => {
    const taskId = `task-${Date.now()}`;
    const correctAdminEmail = userProfile?.adminEmail 
      ? userProfile.adminEmail.toLowerCase() 
      : (currentUser?.email.toLowerCase() || 'admin@example.com');

    const newTask: Task = {
      ...newTaskData,
      id: taskId,
      status: newTaskData.status || 'Pendente',
      actualMinutes: 0,
      createdAt: new Date().toISOString(),
      userEmail: currentUser?.email.toLowerCase() || 'admin@example.com',
      adminEmail: correctAdminEmail
    };

    // Sempre define a data ativa global no dia em que a tarefa foi criada
    // para que ao redirecionar, o usuário veja instantaneamente o novo agendamento!
    setActiveDate(newTask.date);

    // Always update local state immediately
    setTasks((prevTasks) => {
      const updated = [newTask, ...prevTasks];
      localStorage.setItem('vall_tasks', JSON.stringify(updated));
      return updated;
    });

    const formattedTaskDate = formatToRelativeDate(newTask.date);
    let successToastMsg = `Atividade agendada para ${formattedTaskDate}`;

    if (newTask.category === 'Agendamento') {
      const timeStr = newTask.time ? ` às ${newTask.time}` : '';
      successToastMsg = `🎯 Agendamento: "${newTask.title}" criado para ${formattedTaskDate}${timeStr}!`;
    } else if (newTask.category === 'Disponível') {
      successToastMsg = `👩‍⚕️ Profissional Disponível: "${newTask.title}" cadastrada para ${formattedTaskDate}!`;
    } else if (newTask.category === 'Curinga') {
      successToastMsg = `🃏 Paciente Curinga: "${newTask.title}" adicionado para ${formattedTaskDate}!`;
    } else if (newTask.category === 'Notas') {
      successToastMsg = `📝 Nota: "${newTask.title}" salva para ${formattedTaskDate}!`;
    }

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', taskId), cleanUndefined(newTask));
        triggerToast(successToastMsg);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
        triggerToast('Erro ao agendar nova tarefa no banco.');
        throw error;
      }
    } else {
      triggerToast(successToastMsg);
    }
  };

  // Incrementa tempo focado em uma tarefa
  const handleAddFocusMinutes = async (taskId: string, mins: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedTask = { ...task, actualMinutes: task.actualMinutes + mins };

    // Always update local state immediately
    setTasks((prevTasks) => {
      const updated = prevTasks.map((t) => (t.id === taskId ? updatedTask : t));
      localStorage.setItem('vall_tasks', JSON.stringify(updated));
      return updated;
    });

    if (firebaseUser && firebaseUser.uid) {
      try {
        await setDoc(doc(db, 'tasks', taskId), cleanUndefined(updatedTask));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
      }
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
    const userName = currentUser?.name || 'Administrador';
    try {
      await auth.signOut();
    } catch (e) {
      console.warn('Silent sign out warning:', e);
    }
    setCurrentUser(null);
    localStorage.removeItem('vall_current_user');
    localStorage.removeItem('vall_user_profile');
    localStorage.removeItem('vall_tasks');
    localStorage.removeItem('vall_tasks_seeded_fb');
    // Clear Google token as well
    localStorage.removeItem('vall_google_token');
    localStorage.removeItem('vall_google_email');
    localStorage.removeItem('vall_google_name');
    setGoogleUser(null);
    setGoogleToken(null);
    setFirebaseUser(null);
    triggerToast(`Até logo, ${userName}! Painel fechado de forma segura.`);
  };

  // Excluir permanentemente a conta de usuário
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const emailLower = currentUser.email.toLowerCase();

    try {
      // 1. Excluir dados adicionais ou perfil do Firestore se houver
      try {
        await deleteDoc(doc(db, 'user_profiles', emailLower));
      } catch (dbErr) {
        console.warn('Silent Firestore profile deletion warning (local fallback):', dbErr);
      }

      // 2. Excluir do localStorage do vall_users
      const usersJson = localStorage.getItem('vall_users');
      if (usersJson) {
        try {
          const users = JSON.parse(usersJson);
          delete users[emailLower];
          localStorage.setItem('vall_users', JSON.stringify(users));
        } catch (localErr) {
          console.warn('Could not clean local users list:', localErr);
        }
      }

      // 3. Excluir conta de login do Firebase Authentication se logado
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (authErr: any) {
          console.warn('Suited Firebase Auth cleanup (requires recent login fallback taken):', authErr);
        }
      }

      // 4. Limpar estados locais, tokens e efetuar logout
      setCurrentUser(null);
      setUserProfile(null);
      setGoogleUser(null);
      setGoogleToken(null);
      setFirebaseUser(null);
      localStorage.removeItem('vall_current_user');
      localStorage.removeItem('vall_user_profile');
      localStorage.removeItem('vall_google_token');
      localStorage.removeItem('vall_google_email');
      localStorage.removeItem('vall_google_name');

      triggerToast("Sua conta foi excluída permanentemente com sucesso!");
    } catch (err) {
      console.error("Erro geral no fluxo de exclusão:", err);
      triggerToast("Ocorreu um erro ao excluir sua conta.");
    }
  };

  const handleLoginSuccess = (user: { name: string; email: string }) => {
    setCurrentUser(user);
    localStorage.setItem('vall_current_user', JSON.stringify(user));

    // Sincronizar automaticamente as credenciais do Google se o login foi via Google
    const savedToken = localStorage.getItem('vall_google_token');
    const savedEmail = localStorage.getItem('vall_google_email');
    if (savedToken && savedEmail) {
      setGoogleToken(savedToken);
      setGoogleUser({
        email: savedEmail,
        displayName: localStorage.getItem('vall_google_name') || 'Usuário Google'
      });
    }

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
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {googleToken ? (
              <div className="flex items-center space-x-1 bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 rounded-full px-2.5 py-1 text-[9px] font-bold text-[#2DD4BF] w-fit relative">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] shrink-0 animate-ping" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] shrink-0 absolute" />
                <span className="truncate max-w-[124px] font-mono pl-3">Agenda: {googleUser?.email || localStorage.getItem('vall_google_email') || 'Google'}</span>
              </div>
            ) : (
              <button 
                onClick={handleGoogleSignIn}
                className="flex items-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full px-2.5 py-1 text-[9px] font-bold text-amber-300 w-fit transition cursor-pointer active:scale-95"
                title="Clique para sincronizar sua agenda agora em 1 segundo!"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="font-mono">Google Agenda (Desconectada)</span>
              </button>
            )}

            {isOnline ? (
              <div 
                className="flex items-center space-x-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 text-[9px] font-bold text-emerald-400 w-fit"
                title={isFromCache ? "Dados carregados do cache local rápido e sincronizando em segundo plano." : "Sua conexão está ativa e os dados são salvos em tempo real."}
              >
                <Wifi size={10} className="shrink-0 text-emerald-400" />
                <span className="font-mono">{isFromCache ? "Salvo (Cache)" : "Em Tempo Real"}</span>
              </div>
            ) : (
              <div 
                className="flex items-center space-x-1 bg-red-400/10 border border-red-500/25 rounded-full px-2.5 py-1 text-[9px] font-bold text-red-400 w-fit"
                title="Você está offline. Todas as alterações serão mantidas em cache e enviadas quando houver conexão."
              >
                <WifiOff size={10} className="shrink-0 text-red-500 animate-pulse" />
                <span className="font-mono">Cache Local (Offline)</span>
              </div>
            )}
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
            onViewTasksTab={() => setActiveTab('tasks')}
            userName={currentUser.name}
            onTriggerToast={triggerToast}
            onDateChange={setActiveDate}
            googleToken={googleToken}
            onUpdateTask={handleUpdateTask}
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
            onTriggerToast={triggerToast}
          />
        )}

        {activeTab === 'gerenciamento' && (
          <Gerenciamento
            currentUser={currentUser}
            userProfile={userProfile}
            onTriggerToast={triggerToast}
            onDeleteAccount={handleDeleteAccount}
            tasks={tasks}
            onDefineAdmin={async () => {
              if (!currentUser) return;
              const newAdminProfile = {
                email: currentUser.email.toLowerCase(),
                name: currentUser.name,
                role: 'admin' as const,
                adminEmail: currentUser.email.toLowerCase(),
                createdAt: new Date().toISOString()
              };

              // Apply locally immediately so the UI responds instantly
              setUserProfile(newAdminProfile);
              localStorage.setItem('vall_user_profile', JSON.stringify(newAdminProfile));
              triggerToast('Perfil estabelecido como Administrador!');

              // Sincroniza em background com o Firestore se houver sessão ativa
              try {
                const profileRef = doc(db, 'user_profiles', currentUser.email.toLowerCase());
                await setDoc(profileRef, newAdminProfile);
              } catch (err) {
                console.warn('Silent offline sync for admin activation:', err);
              }
            }}
          />
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

         {/* FileText: Relatórios Tátegos */}
         <button 
           onClick={() => {
             setIsReportOpen(true);
           }}
           id="nav_btn_report"
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
             isReportOpen
               ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
               : 'text-gray-300 hover:text-white hover:bg-white/10'
           }`}
           title="Relatórios e PDFs"
         >
           <FileText size={20} />
         </button>
          {/* Users: Gerenciamento */}
          <button 
            onClick={() => {
              setActiveTab('gerenciamento');
              setIsReportOpen(false);
              setSelectedTaskForFocus(null);
            }}
            id="nav_btn_gerenciamento"
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer duration-100 ease-out active:scale-95 ${
              activeTab === 'gerenciamento'
                ? 'bg-[#2DD4BF] text-black shadow-[0_0_18px_rgba(45,212,191,0.45)] font-bold scale-105'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Gerenciamento de Equipe"
          >
            <Users size={20} />
          </button>
      </nav>

      {/* MODAL DE RELATÓRIO TÁTICO */}
      {isReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in" id="modal_relatorio">
          <div className="bg-[#0b1528] border border-white/10 w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
            {/* Decorações estéticas brilhantes em espiral ambientais */}
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#2DD4BF]/10 rounded-full blur-3xl pointer-events-none" />
            
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5 relative z-10">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF]">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">Relatórios</h3>
                </div>
              </div>
              <button 
                onClick={() => setIsReportOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition active:scale-90 cursor-pointer"
                title="Fechar relatório"
              >
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo scrollable */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 relative z-10 scrollbar-none">
              <RelatorioUI 
                tasks={tasks} 
                userName={currentUser.name} 
                onTriggerToast={triggerToast} 
                defaultOpen={true}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
