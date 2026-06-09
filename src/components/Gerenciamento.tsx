import React, { useState, useEffect } from 'react';
import { Users, Shield, Trash2, UserPlus, Lock, Mail, User, Info, Check, Copy, Sparkles, Clock } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType, cleanUndefined } from '../googleAuth';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';

interface UserProfile {
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
}

interface GerenciamentoProps {
  currentUser: { name: string; email: string };
  userProfile: UserProfile | null;
  onTriggerToast: (msg: string) => void;
  onDefineAdmin: () => void;
  onDeleteAccount: () => Promise<void>;
}

export default function Gerenciamento({ currentUser, userProfile, onTriggerToast, onDefineAdmin, onDeleteAccount }: GerenciamentoProps) {
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>(() => {
    if (userProfile) {
      const adminEmailStr = (userProfile.adminEmail || userProfile.email || '').toLowerCase();
      const initialAdmin: UserProfile = {
        email: adminEmailStr,
        name: adminEmailStr === currentUser.email.toLowerCase() ? currentUser.name : 'Administrador',
        role: 'admin',
        adminEmail: adminEmailStr,
        createdAt: userProfile.createdAt || new Date().toISOString()
      };
      
      const cached = localStorage.getItem(`vall_team_members_${adminEmailStr}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasAdmin = parsed.some(m => m.role === 'admin' || m.email.toLowerCase() === adminEmailStr);
            if (!hasAdmin) {
              parsed.push(initialAdmin);
            }
            parsed.sort((a, b) => {
              if (a.role === 'admin') return -1;
              if (b.role === 'admin') return 1;
              return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
            });
            return parsed;
          }
        } catch (e) {}
      }
      return [initialAdmin];
    }
    return [];
  });
  const [isAdding, setIsAdding] = useState(false);
  
  // Form fields
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Excluir conta
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Password change fields
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);

  // Daily Report Assistant States
  const [reportEnabled, setReportEnabled] = useState<boolean>(() => {
    return userProfile?.dailyReportConfig?.enabled || false;
  });
  const [reportEmail, setReportEmail] = useState<string>(() => {
    return currentUser.email.toLowerCase(); // Strictly lock to logged in user's email
  });
  const [reportSendTime, setReportSendTime] = useState<string>(() => {
    return userProfile?.dailyReportConfig?.sendTime || '08:00';
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    setReportEmail(currentUser.email.toLowerCase());
    if (userProfile) {
      if (userProfile.dailyReportConfig) {
        setReportEnabled(userProfile.dailyReportConfig.enabled);
        setReportSendTime(userProfile.dailyReportConfig.sendTime || '08:00');
      } else {
        setReportSendTime('08:00');
      }
    }
  }, [userProfile, currentUser]);

  const handleSaveReportConfig = async () => {
    if (!userProfile) return;
    setIsSavingConfig(true);
    try {
      const emailLower = currentUser.email.toLowerCase();
      const updatedProf: UserProfile = {
        ...userProfile,
        dailyReportConfig: {
          ...(userProfile.dailyReportConfig || {}),
          enabled: reportEnabled,
          email: emailLower, // Locked to user's login email
          sendTime: reportSendTime
        }
      };

      await setDoc(doc(db, 'user_profiles', emailLower), cleanUndefined(updatedProf));
      localStorage.setItem('vall_user_profile', JSON.stringify(updatedProf));
      
      onTriggerToast('Configurações do relatório salvas com sucesso!');
    } catch (err) {
      console.error('Failed to save daily report config:', err);
      onTriggerToast('Erro ao salvar as configurações do relatório.');
    } finally {
      setIsSavingConfig(false);
    }
  };



  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const newPass = changeNewPassword.trim();
    const confirmPass = changeConfirmPassword.trim();

    if (!newPass || !confirmPass) {
      onTriggerToast('Por favor, preencha todos os campos!');
      return;
    }

    if (newPass.length < 6) {
      onTriggerToast('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPass !== confirmPass) {
      onTriggerToast('As senhas digitadas não coincidem.');
      return;
    }

    setIsChangingPassword(true);
    try {
      // 1. Update Firebase Auth Password if authenticated
      if (auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPass);
        } catch (authErr: any) {
          console.warn('Falha ao atualizar senha no Firebase Auth:', authErr);
          if (authErr && authErr.code === 'auth/requires-recent-login') {
            onTriggerToast('Por segurança, faça login novamente para trocar a senha.');
            setIsChangingPassword(false);
            return;
          }
        }
      }

      // 2. Update Firestore profile
      const updatedProf = {
        ...userProfile,
        password: newPass
      };
      
      try {
        await setDoc(doc(db, 'user_profiles', currentUser.email.toLowerCase()), cleanUndefined(updatedProf));
      } catch (dbErr) {
        console.warn('Erro ao sincronizar nova senha com o Firestore:', dbErr);
      }

      // 3. Update localStorage users pool for offline resilience
      const usersJson = localStorage.getItem('vall_users');
      if (usersJson) {
        try {
          const users = JSON.parse(usersJson);
          if (users[currentUser.email.toLowerCase()]) {
            users[currentUser.email.toLowerCase()].password = newPass;
            localStorage.setItem('vall_users', JSON.stringify(users));
          }
        } catch (e) {}
      }

      // 4. Update locally cached profile so state reflects it
      localStorage.setItem('vall_user_profile', JSON.stringify(updatedProf));

      onTriggerToast('Senha atualizada com sucesso!');
      setChangeNewPassword('');
      setChangeConfirmPassword('');
      setShowChangeForm(false);
    } catch (err) {
      console.error(err);
      onTriggerToast('Ocorreu um erro ao alterar a senha.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccountRequest = async () => {
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } catch (err) {
      console.error(err);
      onTriggerToast('Erro ao realizar a exclusão da conta.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Sync team members under the same adminEmail
  useEffect(() => {
    if (!userProfile) return;

    const loadLocalTeamBackup = () => {
      const cached = localStorage.getItem(`vall_team_members_${userProfile.adminEmail.toLowerCase()}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            const hasAdmin = parsed.some(m => m.role === 'admin' || m.email.toLowerCase() === userProfile.adminEmail.toLowerCase());
            if (!hasAdmin) {
              parsed.push({
                email: userProfile.adminEmail.toLowerCase(),
                name: userProfile.name || 'Administrador',
                role: 'admin',
                adminEmail: userProfile.adminEmail.toLowerCase(),
                createdAt: userProfile.createdAt || new Date().toISOString()
              });
            }
            // Sort parsed members
            parsed.sort((a, b) => {
              if (a.role === 'admin') return -1;
              if (b.role === 'admin') return 1;
              return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
            });
            setTeamMembers(parsed);
            return;
          }
        } catch (e) {}
      }

      // Default fallback reconstruction
      const members: UserProfile[] = [];
      members.push({
        email: userProfile.adminEmail.toLowerCase(),
        name: userProfile.adminEmail.toLowerCase() === currentUser.email.toLowerCase() ? currentUser.name : 'Administrador',
        role: 'admin',
        adminEmail: userProfile.adminEmail.toLowerCase(),
        createdAt: userProfile.createdAt || new Date().toISOString()
      });

      const usersJson = localStorage.getItem('vall_users');
      if (usersJson) {
        try {
          const users = JSON.parse(usersJson);
          Object.keys(users).forEach((email) => {
            if (email.toLowerCase() !== userProfile.adminEmail.toLowerCase()) {
              members.push({
                email: email.toLowerCase(),
                name: users[email].name,
                role: 'member',
                adminEmail: userProfile.adminEmail.toLowerCase(),
                password: users[email].password,
                createdAt: new Date().toISOString()
              });
            }
          });
        } catch (e) {}
      }
      setTeamMembers(members);
    };

    const profilesRef = collection(db, 'user_profiles');
    const q = query(profilesRef, where('adminEmail', '==', userProfile.adminEmail.toLowerCase()));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const members: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        members.push(docSnap.data() as UserProfile);
      });

      // Ensure the Admin themselves is always part of the team
      const hasAdmin = members.some(m => m.role === 'admin' || m.email.toLowerCase() === userProfile.adminEmail.toLowerCase());
      if (!hasAdmin && userProfile) {
        members.push({
          email: userProfile.adminEmail.toLowerCase(),
          name: userProfile.name || 'Administrador',
          role: 'admin',
          adminEmail: userProfile.adminEmail.toLowerCase(),
          createdAt: userProfile.createdAt || new Date().toISOString()
        });
      }

      // Sort members (admin first, then oldest member)
      members.sort((a, b) => {
        if (a.role === 'admin') return -1;
        if (b.role === 'admin') return 1;
        return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
      });
      setTeamMembers(members);
      localStorage.setItem(`vall_team_members_${userProfile.adminEmail.toLowerCase()}`, JSON.stringify(members));
    }, (error) => {
      console.warn('Realtime database team query failed. Loading local simulated team members fallback.', error);
      loadLocalTeamBackup();
    });

    return () => unsubscribe();
  }, [userProfile, currentUser]);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || userProfile.role !== 'admin') return;

    const emailLower = newEmail.trim().toLowerCase();
    const nameTrim = newName.trim();
    const passTrim = newPassword.trim();

    if (!emailLower || !nameTrim || !passTrim) {
      onTriggerToast('Por favor, preencha todos os campos!');
      return;
    }

    if (passTrim.length < 6) {
      onTriggerToast('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    // Capacity constraint: Admin (1) + members (3) = 4 total
    if (teamMembers.length >= 4) {
      onTriggerToast('Limite máximo de 4 participantes na agenda já atingido.');
      return;
    }

    // Check if email already exists in team
    const exists = teamMembers.some(m => m.email.toLowerCase() === emailLower);
    if (exists) {
      onTriggerToast('Este e-mail já está cadastrado na equipe.');
      return;
    }

    setIsSubmitting(true);
    try {
      const memberProf: UserProfile = {
        email: emailLower,
        name: nameTrim,
        role: 'member',
        adminEmail: userProfile.email.toLowerCase(),
        password: passTrim,
        createdAt: new Date().toISOString()
      };

      // 1. Immediately register inside local mock users fallback for resilient logins
      const usersJson = localStorage.getItem('vall_users');
      let users = usersJson ? JSON.parse(usersJson) : {};
      users[emailLower] = { name: nameTrim, password: passTrim };
      localStorage.setItem('vall_users', JSON.stringify(users));

      // 2. Try to sync to FireStore in background
      try {
        await setDoc(doc(db, 'user_profiles', emailLower), cleanUndefined(memberProf));
      } catch (dbErr) {
        console.warn('Silent Firestore member registration failed (local mode):', dbErr);
      }

      // 3. Immediately update state so offline or backend issues don't delay the UI update
      setTeamMembers((prev) => {
        const filtered = prev.filter(m => m.email.toLowerCase() !== emailLower);
        const updated = [...filtered, memberProf];
        localStorage.setItem(`vall_team_members_${userProfile.adminEmail.toLowerCase()}`, JSON.stringify(updated));
        return updated;
      });

      onTriggerToast(`Membro ${nameTrim} cadastrado com sucesso!`);
      
      // Reset form
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setIsAdding(false);
    } catch (err) {
      console.error(err);
      onTriggerToast('Erro ao criar novo membro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (email: string) => {
    if (!userProfile || userProfile.role !== 'admin') {
      onTriggerToast('Apenas o Administrador pode remover membros.');
      return;
    }

    if (email.toLowerCase() === userProfile.email.toLowerCase()) {
      onTriggerToast('Você não pode se remover como administrador.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover o acesso de ${email}?`)) {
      return;
    }

    try {
      // 1. Instantly remove from local users fallback
      const usersJson = localStorage.getItem('vall_users');
      if (usersJson) {
        let users = JSON.parse(usersJson);
        delete users[email.toLowerCase()];
        localStorage.setItem('vall_users', JSON.stringify(users));
      }

      // 2. Try background Firestore deletion 
      try {
        await deleteDoc(doc(db, 'user_profiles', email.toLowerCase()));
      } catch (dbErr) {
        console.warn('Silent Firestore member deletion failed (local mode):', dbErr);
      }

      // 3. Instantly update UI teamMembers state
      setTeamMembers((prev) => {
        const updated = prev.filter(m => m.email.toLowerCase() !== email.toLowerCase());
        localStorage.setItem(`vall_team_members_${userProfile.adminEmail.toLowerCase()}`, JSON.stringify(updated));
        return updated;
      });

      onTriggerToast('Acesso de membro revogado do aplicativo.');
    } catch (err) {
      console.error(err);
      onTriggerToast('Falha ao remover membro.');
    }
  };

  const handleCopyCredentials = (member: UserProfile) => {
    const text = `Acesso ao VALL:\nE-mail: ${member.email}\nSenha: ${member.password || '*****'}`;
    navigator.clipboard.writeText(text);
    setCopiedEmail(member.email);
    onTriggerToast('Dados de acesso copiados!');
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // 1. Setup/Onboarding State (Not configured as Admin or Member yet)
  if (!userProfile) {
    return (
      <div className="space-y-6 pt-2 animate-in fade-in duration-200">
        <div className="glass rounded-[2rem] p-6 border border-white/10 relative overflow-hidden bg-black/40">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#2DD4BF]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center space-x-3.5 mb-5 pb-3.5 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF]">
              <Users size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base uppercase tracking-wider text-white">Configurar Perfil de Trabalho</h2>
              <p className="text-[10px] text-gray-400">Ative seu painel para liderar sua agenda</p>
            </div>
          </div>

          <div className="space-y-4 text-left">
            <p className="text-xs text-gray-300 leading-relaxed">
              O <strong className="text-white">VALL</strong> suporta a colaboração em tempo real para até <strong>4 pessoas compartilhando o mesmo aplicativo</strong> e a mesma agenda coletiva.
            </p>
            
            <div className="p-4 rounded-2xl bg-[#2DD4BF]/5 border border-[#2DD4BF]/15 space-y-2.5">
              <div className="flex items-start space-x-2.5">
                <Shield size={16} className="text-[#2DD4BF] shrink-0 mt-0.5" />
                <p className="text-xs text-[#2DD4BF] font-semibold">Funções do Administrador Principal:</p>
              </div>
              <ul className="text-[11px] text-gray-300 list-disc list-inside space-y-1.5 pl-1 font-mono">
                <li>Cadastrar/Gerenciar até 3 pessoas adicionais</li>
                <li>Visualização e edição da mesma agenda</li>
                <li>Compartilhamento integral das tarefas de equipe</li>
              </ul>
            </div>

            <button
              onClick={onDefineAdmin}
              className="w-full mt-4 bg-[#2DD4BF] text-black py-3.5 px-5 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_20px_rgba(45,212,191,0.25)] hover:bg-[#5eead4] hover:scale-[1.01] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[46px]"
            >
              <Shield size={14} />
              <span>Ativar meu perfil como Administrador</span>
            </button>
            
            <p className="text-[10px] text-gray-400 text-center font-mono italic">
              *Se você é um participante convidado, sua conta já deve ter sido criada por um administrador.
            </p>
          </div>
        </div>

        {/* EXCLUIR MINHA CONTA */}
        <div className="glass rounded-[2rem] p-6 border border-red-500/10 relative overflow-hidden bg-red-950/10 text-left">
          <div className="flex items-center space-x-3.5 mb-4 pb-3 border-b border-red-500/15">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Trash2 size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base uppercase tracking-wider text-white">Zona de Perigo</h2>
              <p className="text-[10px] text-gray-400">Remover permanentemente seus dados do VALL</p>
            </div>
          </div>
          
          {!showDeleteConfirm ? (
            <>
              <p className="text-xs text-gray-300 leading-relaxed mb-4">
                Ao excluir sua conta, todas as suas informações de perfil, acessos e vinculações de calendário serão apagados imediatamente de forma definitiva.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full bg-red-500/15 border border-red-500/35 hover:bg-red-500/25 text-red-200 py-3.5 px-5 rounded-2xl font-bold uppercase tracking-wider text-xs transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[46px]"
              >
                <Trash2 size={14} />
                <span>Excluir Minha Conta</span>
              </button>
            </>
          ) : (
            <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl animate-in fade-in duration-200">
              <p className="text-xs text-red-200 font-bold mb-3 leading-relaxed">
                Você tem certeza absoluta? Esta ação de exclusão da conta é definitiva e irreversível! Todas as suas informações no VALL serão excluídas do sistema.
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteAccountRequest}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer flex items-center justify-center space-x-1"
                >
                  {isDeleting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <span>Sim, Excluir Definitivamente</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    );
  }

  const isAdminRole = userProfile.role === 'admin';
  const additionalCount = teamMembers.filter(m => m.role === 'member').length;
  const totalSpots = teamMembers.length;

  return (
    <div className="space-y-6 pt-2 pb-24 animate-in fade-in duration-200">
      {/* 2. Visual Badge & Header */}
      <div className="glass rounded-[2rem] p-6 border border-white/10 relative overflow-hidden bg-black/40">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#2DD4BF]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5 select-none">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF]">
              <Users size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base uppercase tracking-wider text-white">Gerenciamento de Equipe</h2>
              <p className="text-[10px] text-gray-400">Compartilhamento de agenda em tempo real</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
            isAdminRole 
              ? 'bg-[#2DD4BF]/10 border border-[#2DD4BF]/25 text-[#2DD4BF]' 
              : 'bg-indigo-500/10 border border-indigo-500/25 text-indigo-300'
          }`}>
            {isAdminRole ? 'Administrador' : 'Membro'}
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start space-x-2.5 mb-5">
          <Info size={16} className="text-[#2DD4BF] shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-300 leading-relaxed text-left">
            {isAdminRole ? (
              <span>Você cadastrou <strong className="text-white">{additionalCount} de 3 adicionais</strong> permitidos. Todos os listados abaixo compartilham a sua agenda VALL em tempo real de forma sincronizada.</span>
            ) : (
              <span>Sua conta está integrada à agenda coletiva de <strong className="text-white">{userProfile.adminEmail}</strong>. Todos os membros do time abaixo compartilham o mesmo calendário.</span>
            )}
          </p>
        </div>

        {/* Team List */}
        <div className="space-y-3.5 text-left">
          <h3 className="text-[10px] text-gray-200 uppercase tracking-widest font-mono font-bold">Listagem de Participantes ({totalSpots}/4)</h3>
          
          <div className="space-y-2.5">
            {teamMembers.map((member) => {
              const isSelf = member.email.toLowerCase() === currentUser.email.toLowerCase();
              const isMemberAdmin = member.role === 'admin';
              
              return (
                <div 
                  key={member.email} 
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                    isSelf 
                      ? 'bg-[#2DD4BF]/5 border-[#2DD4BF]/20 shadow-[0_0_15px_rgba(45,212,191,0.03)]' 
                      : 'bg-white/5 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                      isMemberAdmin 
                        ? 'bg-[#2DD4BF] text-black shadow-[0_0_10px_rgba(45,212,191,0.3)]' 
                        : 'bg-white/10 text-gray-100 border border-white/10'
                    }`}>
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-xs text-white truncate">{member.name}</span>
                        {isSelf && <span className="text-[8px] bg-[#2DD4BF]/10 text-[#2DD4BF] font-bold px-1.5 py-0.5 rounded-full uppercase scale-90">Você</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono truncate">{member.email}</p>
                      
                      {/* Password visualizer if requested by admin */}
                      {isAdminRole && !isMemberAdmin && member.password && (
                        <p className="text-[9px] text-gray-300 font-mono mt-0.5" title="Copiar credenciais do membro">
                          Senha: <span className="font-extrabold text-[#2DD4BF]/90 text-[10px] select-all">{member.password}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Operational actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {isAdminRole && !isMemberAdmin && (
                      <>
                        <button
                          onClick={() => handleCopyCredentials(member)}
                          className="w-8 h-8 rounded-full bg-white/5 border border-white/5 hover:bg-[#2DD4BF]/10 hover:border-[#2DD4BF]/20 hover:text-[#2DD4BF] flex items-center justify-center text-gray-300 transition cursor-pointer"
                          title="Copiar dados de acesso de login"
                        >
                          {copiedEmail === member.email ? <Check size={14} className="text-[#2DD4BF]" /> : <Copy size={13} />}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.email)}
                          className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/10 hover:bg-red-500/20 hover:border-red-500/30 flex items-center justify-center text-red-400 transition cursor-pointer"
                          title="Revogar credenciais corporativas do membro"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    {isMemberAdmin && (
                      <span className="text-[8px] font-bold text-amber-300/80 uppercase tracking-widest py-1 px-2 border border-amber-500/20 bg-amber-500/5 rounded-full font-mono select-none">LÍDER</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Add Member Option for Admin */}
        {isAdminRole && (
          <div className="mt-6 pt-5 border-t border-white/5 text-left">
            {!isAdding ? (
              totalSpots < 4 ? (
                <button
                  onClick={() => setIsAdding(true)}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 border border-dashed border-[#2DD4BF]/30 hover:border-[#2DD4BF]/70 text-[#2DD4BF] hover:bg-[#2DD4BF]/5 rounded-2xl text-xs font-bold transition cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Cadastrar Participante Adicional ({4 - totalSpots} restante{4 - totalSpots > 1 ? 's' : ''})</span>
                </button>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-center">
                  <span className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider block">Limite de Equipe Atingido</span>
                  <p className="text-[10px] text-gray-400 mt-1">Sua agenda coletiva está cheia (1 Administrador + 3 Membros).</p>
                </div>
              )
            ) : (
              <form onSubmit={handleCreateMember} className="space-y-4 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[10px] text-[#2DD4BF] uppercase tracking-wider font-extrabold font-mono">Cadastrar Novo Participante</h4>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="text-[10px] text-gray-400 hover:text-white transition uppercase font-bold cursor-pointer underline"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Name field */}
                  <div className="space-y-1">
                    <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">Nome do Participante</span>
                    <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                      <User className="text-gray-400 mr-2 shrink-0" size={14} />
                      <input
                        type="text"
                        required
                        placeholder="Ex: João Silva"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5"
                      />
                    </div>
                  </div>

                  {/* Email field */}
                  <div className="space-y-1">
                    <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">E-mail de Acesso</span>
                    <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                      <Mail className="text-gray-400 mr-2 shrink-0" size={14} />
                      <input
                        type="email"
                        required
                        placeholder="joao@vall.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-mono"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-1">
                    <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">Senha Inicial (Min. 6 dgt)</span>
                    <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                      <Lock className="text-gray-400 mr-2 shrink-0" size={14} />
                      <input
                        type="text"
                        required
                        placeholder="Indique uma senha primária"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#2DD4BF] text-black py-3 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_15px_rgba(45,212,191,0.2)] hover:bg-[#5eead4] active:scale-95 transition min-h-[42px] flex items-center justify-center space-x-1 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin mr-1" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      <span>Concluir Cadastro</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ALTERAÇÃO DE SENHA */}
      <div className="glass rounded-[2rem] p-6 border border-white/10 relative overflow-hidden bg-black/40 text-left">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#2DD4BF]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center space-x-3.5 mb-4 pb-3 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF]">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="font-extrabold text-base uppercase tracking-wider text-white">Alteração de Senha</h2>
            <p className="text-[10px] text-gray-400">Atualize sua senha de acesso ao VALL</p>
          </div>
        </div>

        {!showChangeForm ? (
          <>
            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Por questões de segurança, mantenha sua senha atualizada para proteger o compartilhamento da sua agenda. No VALL, todos os colaboradores utilizam senha própria.
            </p>
            <button
              onClick={() => setShowChangeForm(true)}
              className="w-full bg-[#2DD4BF]/10 border border-[#2DD4BF]/30 hover:bg-[#2DD4BF]/15 text-[#2DD4BF] py-3.5 px-5 rounded-2xl font-bold uppercase tracking-wider text-xs transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[46px]"
            >
              <Lock size={14} />
              <span>Alterar Minha Senha</span>
            </button>
          </>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4 animate-in slide-in-from-bottom-2 duration-200">
            <div className="space-y-3">
              {/* password field */}
              <div className="space-y-1">
                <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">Nova Senha (Mín. 6 caracteres)</span>
                <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                  <Lock className="text-gray-400 mr-2 shrink-0" size={14} />
                  <input
                    type="password"
                    required
                    placeholder="Digite sua nova senha"
                    value={changeNewPassword}
                    onChange={(e) => setChangeNewPassword(e.target.value)}
                    className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-mono"
                  />
                </div>
              </div>

              {/* confirm password field */}
              <div className="space-y-1">
                <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">Confirmar Nova Senha</span>
                <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                  <Lock className="text-gray-400 mr-2 shrink-0" size={14} />
                  <input
                    type="password"
                    required
                    placeholder="Confirme sua nova senha"
                    value={changeConfirmPassword}
                    onChange={(e) => setChangeConfirmPassword(e.target.value)}
                    className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="flex-1 bg-[#2DD4BF] hover:bg-[#5eead4] disabled:opacity-50 text-black py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer flex items-center justify-center space-x-1 min-h-[40px]"
              >
                {isChangingPassword ? (
                  <>
                    <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin mr-1" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Nova Senha</span>
                )}
              </button>
              <button
                type="button"
                disabled={isChangingPassword}
                onClick={() => {
                  setChangeNewPassword('');
                  setChangeConfirmPassword('');
                  setShowChangeForm(false);
                }}
                className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer min-h-[40px]"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ASSISTENTE DE RELATÓRIO DIÁRIO */}
      <div className="glass rounded-[2rem] p-6 border border-white/10 relative overflow-hidden bg-black/40 text-left">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#2DD4BF]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center space-x-3.5 mb-4 pb-3 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF]">
            <Sparkles size={18} className="text-[#2DD4BF]" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm uppercase tracking-wider text-white">Assistente de Relatório Diário</h2>
            <p className="text-[10px] text-gray-400">Receba o resumo operacional do dia às {reportSendTime} no seu e-mail</p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            Configure o assistente inteligente para extrair automaticamente os dados de <strong className="text-white">Curinga</strong>, <strong className="text-white">Disponível</strong> e <strong className="text-white">Agendamento</strong> e transformá-los em um e-mail formatado em Markdown às <strong className="text-white">{reportSendTime}</strong> pronto para otimizar suas atividades.
          </p>

          <div className="flex items-start space-x-3 bg-white/5 p-3.5 rounded-2xl border border-white/10">
            <input
              type="checkbox"
              id="reportEnabled"
              checked={reportEnabled}
              onChange={(e) => setReportEnabled(e.target.checked)}
              className="w-4 h-4 rounded mt-0.5 border-white/20 bg-black/40 text-[#2DD4BF] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2DD4BF]"
            />
            <label htmlFor="reportEnabled" className="text-xs font-semibold text-gray-300 select-none cursor-pointer leading-tight">
              Ativar envio automático do e-mail de relatório consolidado todo dia às {reportSendTime} (Fuso de Brasília / BRT)
            </label>
          </div>

          {reportEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">Horário de Envio (BRT)</span>
                <div className="flex items-center bg-white/5 border border-white/15 rounded-2xl p-2 px-3 focus-within:border-[#2DD4BF]/50">
                  <Clock className="text-gray-400 mr-2 shrink-0" size={14} />
                  <input
                    type="time"
                    value={reportSendTime}
                    onChange={(e) => setReportSendTime(e.target.value)}
                    required
                    className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-mono cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-400 uppercase font-mono tracking-widest pl-1 block">E-mail de Destino para Envios</span>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-2 px-3 opacity-60">
                  <Mail className="text-gray-400 mr-2 shrink-0" size={14} />
                  <input
                    type="email"
                    value={currentUser.email}
                    disabled
                    placeholder="Seu e-mail de login"
                    className="bg-transparent text-xs w-full text-gray-400 border-0 outline-none focus:outline-none focus:ring-0 pt-0.5 font-sans cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-1.5">
            <button
              type="button"
              onClick={handleSaveReportConfig}
              disabled={isSavingConfig}
              className="w-full bg-[#2DD4BF] hover:bg-[#5eead4] disabled:opacity-50 text-black py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer flex items-center justify-center space-x-1 min-h-[40px]"
            >
              {isSavingConfig ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin mr-1" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Configurações</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* EXCLUIR MINHA CONTA */}
      <div className="glass rounded-[2rem] p-6 border border-red-500/10 relative overflow-hidden bg-red-950/10 text-left">
        <div className="flex items-center space-x-3.5 mb-4 pb-3 border-b border-red-500/15">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 className="font-extrabold text-base uppercase tracking-wider text-white">Zona de Perigo</h2>
            <p className="text-[10px] text-gray-400">Remover permanentemente seus dados do VALL</p>
          </div>
        </div>
        
        {!showDeleteConfirm ? (
          <>
            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Esta ação excluirá permanentemente sua conta de usuário, perfil profissional e vinculações associadas ao e-mail <strong className="text-white">{currentUser.email}</strong>. Esta ação é definitiva e irreversível.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-red-500/15 border border-red-500/35 hover:bg-red-500/25 text-red-200 py-3.5 px-5 rounded-2xl font-bold uppercase tracking-wider text-xs transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[46px]"
            >
              <Trash2 size={14} />
              <span>Excluir Minha Conta</span>
            </button>
          </>
        ) : (
          <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl animate-in fade-in duration-200">
            <p className="text-xs text-red-200 font-bold mb-3 leading-relaxed">
              Você tem certeza absoluta? Esta ação de exclusão da conta é definitiva e irreversível! Todas as suas informações e histórico de tarefas associados ao e-mail <strong className="text-white">{currentUser.email}</strong> serão excluídos do sistema.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAccountRequest}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer flex items-center justify-center space-x-1"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Sim, Excluir Definitivamente</span>
                )}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-[10px] text-center transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
