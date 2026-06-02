import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../googleAuth';
import { ShieldCheck, UserPlus, Users, Mail, Trash2, Clock, CheckCircle2, AlertTriangle, Copy, Check } from 'lucide-react';

interface Member {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  joinedAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  organizationId: string;
  invitedByEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export default function MemberManagement() {
  const { organizationId, organization, role, user } = useTenant();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [emailToInvite, setEmailToInvite] = useState('');
  const [roleToInvite, setRoleToInvite] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'text' | 'error'; text: string } | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [lastCreatedInvite, setLastCreatedInvite] = useState<{ id: string; email: string } | null>(null);
  
  // Custom Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  } | null>(null);

  const triggerConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    type: 'danger' | 'warning' | 'info' = 'warning'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      type
    });
  };

  const isAdmin = role === 'admin';

  // Fetch Current Members of the Subcollection /organizations/{orgId}/members
  useEffect(() => {
    if (!organizationId) return;

    setLoadingMembers(true);
    const membersRef = collection(db, 'organizations', organizationId, 'members');
    
    const unsubscribe = onSnapshot(
      membersRef,
      (snapshot) => {
        const list: Member[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Member);
        });
        setMembers(list);
        setLoadingMembers(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `organizations/${organizationId}/members`);
        setLoadingMembers(false);
      }
    );

    return () => unsubscribe();
  }, [organizationId]);

  // Fetch Sent Pending Invites belonging to this Organization
  useEffect(() => {
    if (!organizationId) return;

    const invitesRef = collection(db, 'invites');
    const q = query(
      invitesRef,
      where('organizationId', '==', organizationId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Invite[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Invite);
        });
        setInvites(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'invites');
      }
    );

    return () => unsubscribe();
  }, [organizationId]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId || !organization) return;
    if (!emailToInvite.trim()) return;

    setSubmitLoading(true);
    setStatusMessage(null);

    const targetEmail = emailToInvite.trim().toLowerCase();
    const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      // 1. Create invite document in `/invites`
      const inviteRef = doc(db, 'invites', inviteId);
      await setDoc(inviteRef, {
        id: inviteId,
        email: targetEmail,
        role: roleToInvite,
        organizationId: organizationId,
        organizationName: organization.name,
        invitedByUid: user.uid,
        invitedByEmail: user.email || '',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setEmailToInvite('');
      setRoleToInvite('viewer');
      setLastCreatedInvite({ id: inviteId, email: targetEmail });
      setStatusMessage({ type: 'success', text: `Convite registrado com sucesso para ${targetEmail}!` });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `invites/${inviteId}`);
      setStatusMessage({ type: 'error', text: 'Não foi possível registrar o convite no banco de dados.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRevokeInvite = (inviteId: string) => {
    triggerConfirm(
      'Revogar Convite',
      'Tem certeza de que deseja cancelar e revogar este convite pendente? O link gerado deixará de funcionar imediatamente.',
      async () => {
        try {
          await deleteDoc(doc(db, 'invites', inviteId));
          setStatusMessage({ type: 'success', text: 'Convite revogado com sucesso!' });
          setTimeout(() => setStatusMessage(null), 4000);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `invites/${inviteId}`);
          setStatusMessage({ type: 'error', text: 'Erro ao revogar o convite.' });
        }
      },
      'danger'
    );
  };

  const handleRemoveMember = (memberId: string, memberEmail: string) => {
    if (memberId === user?.uid) {
      triggerConfirm(
        'Ação Não Permitida',
        'Você não pode remover a si mesmo da organização.',
        () => {},
        'info'
      );
      return;
    }

    triggerConfirm(
      'Remover Membro',
      `Tem certeza de que deseja revogar o acesso e remover permanentemente o membro ${memberEmail} da organização?`,
      async () => {
        try {
          // Remove member from subcollection
          await deleteDoc(doc(db, 'organizations', organizationId!, 'members', memberId));
          
          // Remove organization reference from user profile (which triggers logout on tenancy side)
          await deleteDoc(doc(db, 'users', memberId));

          setStatusMessage({ type: 'success', text: 'Membro removido com sucesso!' });
          setTimeout(() => setStatusMessage(null), 4000);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `organizations/${organizationId}/members/${memberId}`);
          setStatusMessage({ type: 'error', text: 'Erro ao remover o membro.' });
        }
      },
      'danger'
    );
  };

  return (
    <div className="space-y-8 animate-fade-in md:p-2 p-0">
      
      {/* Top Welcome Card */}
      <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="text-[10px] bg-emerald-500/10 text-[#4ade80] px-3 py-1 rounded-full font-bold uppercase tracking-widest font-mono border border-emerald-500/20">
              Tenancy Ativo: {organization?.name || 'Carregando...'}
            </span>
            <h2 className="text-3xl font-black uppercase text-white mt-3 tracking-tight">
              Gerenciar Equipe e Acessos
            </h2>
            <p className="text-gray-400 text-sm mt-1 max-w-xl">
              Como <strong className="text-white uppercase font-semibold">{role}</strong>, você possui controle sobre suas permissões e a visibilidade de outros membros associados.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4 self-start font-mono">
            <Users className="w-5 h-5 text-[#2DD4BF]" />
            <div>
              <div className="text-[9px] text-gray-400 uppercase font-sans font-bold">Total Membros</div>
              <div className="text-white text-lg font-black">{loadingMembers ? 'Calculando...' : members.length}</div>
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="space-y-3">
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm font-semibold transition animate-fade-in ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-[#4ade80]' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <div className="flex items-center space-x-3">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            <button 
              onClick={() => setStatusMessage(null)}
              className="text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded-md bg-white/5 border border-white/5 hover:bg-white/10"
            >
              Fechar
            </button>
          </div>

          {statusMessage.type === 'success' && lastCreatedInvite && (
            <div className="bg-neutral-900 border border-emerald-500/20 rounded-3xl p-6 space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-white font-sans">Compartilhar Link de Convite</h4>
                  <p className="text-gray-400 text-xs leading-relaxed font-sans">
                    Como o envio de e-mails automáticos depende de uma integração SMTP ou API corporativa ativa, você pode copiar e enviar o link de convite personalizado diretamente por WhatsApp, Slack, Teams ou e-mail pessoal:
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${window.location.pathname}?id=${lastCreatedInvite.id}`}
                  className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-[#2DD4BF] font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?id=${lastCreatedInvite.id}`);
                    setCopiedInviteId(lastCreatedInvite.id);
                    setTimeout(() => setCopiedInviteId(null), 3500);
                  }}
                  className="bg-[#2DD4BF] hover:bg-[#20bda8] text-black px-5 py-3 rounded-2xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 shrink-0 active:scale-95 cursor-pointer font-sans"
                >
                  {copiedInviteId === lastCreatedInvite.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Link de Convite</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: Current Members List */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 shadow-md">
            <h3 className="text-xl font-extrabold text-white flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-[#2DD4BF]" />
              <span>Membros Ativos ({members.length})</span>
            </h3>

            {loadingMembers ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-[#2DD4BF]/20 border-t-[#2DD4BF] rounded-full animate-spin"></div>
              </div>
            ) : members.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhum membro encontrado neste inquilino.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {members.map((member) => (
                  <div key={member.id} className="py-4 flex justify-between items-center gap-4 transition hover:bg-white/[0.01] px-2 rounded-xl">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm truncate block">{member.displayName}</span>
                        {member.uid === user?.uid && (
                          <span className="text-[9px] bg-white/10 text-gray-300 font-bold uppercase rounded px-1.5 py-0.5">Você</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-mono truncate block">{member.email}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Badge de Cargo */}
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                        member.role === 'admin' 
                          ? 'bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/30' 
                          : member.role === 'editor'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}>
                        {member.role}
                      </span>

                      {/* Botão de Excluir Membro (Apenas admins podem excluir outros) */}
                      {isAdmin && member.uid !== user?.uid && (
                        <button
                          onClick={() => handleRemoveMember(member.uid, member.email)}
                          className="text-gray-500 hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/10 transition cursor-pointer"
                          title="Remover Membro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Sent Invites Section */}
          {invites.length > 0 && (
            <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 shadow-md">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>Convites Pendentes ({invites.length})</span>
              </h3>

              <div className="divide-y divide-white/5">
                {invites.map((invite) => (
                  <div key={invite.id} className="py-4 flex justify-between items-center gap-4 px-2 rounded-xl">
                    <div className="min-w-0">
                      <span className="text-white text-sm font-bold truncate block">{invite.email}</span>
                      <span className="text-[10px] text-gray-500 font-mono block">Enviado por: {invite.invitedByEmail}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] bg-amber-500/5 text-amber-400 font-mono font-bold border border-amber-500/10 px-2.5 py-1 rounded-md uppercase">
                        {invite.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?id=${invite.id}`);
                          setCopiedInviteId(invite.id);
                          setTimeout(() => setCopiedInviteId(null), 3000);
                        }}
                        className="text-gray-400 hover:text-emerald-400 p-1.5 rounded-lg hover:bg-white/5 transition flex items-center justify-center shrink-0 cursor-pointer"
                        title="Copiar Link de Convite"
                      >
                        {copiedInviteId === invite.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleRevokeInvite(invite.id)}
                          className="text-gray-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/5 transition cursor-pointer shrink-0"
                          title="Excluir/Revogar Convite"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Invite Form (Only visual / accessible for admins) */}
        <div className="space-y-6">
          <div className="bg-neutral-900 border border-white/5 rounded-3xl p-6 shadow-md relative overflow-hidden">
            
            {/* Se o usuário atual não for administrador, exibe overlay informativa */}
            {!isAdmin && (
              <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <ShieldCheck className="w-12 h-12 text-[#2DD4BF]" />
                <div className="space-y-1">
                  <h4 className="text-lg font-extrabold text-white">Painel Restrito</h4>
                  <p className="text-gray-400 text-xs leading-relaxed max-w-xs">
                    Parabéns pelo acesso à organização! No entanto, apenas administradores com a Role <strong>'admin'</strong> podem recrutar e convidar outras pessoas.
                  </p>
                </div>
              </div>
            )}

            <h3 className="text-xl font-extrabold text-white flex items-center gap-2 mb-6">
              <UserPlus className="w-5 h-5 text-[#2DD4BF]" />
              <span>Convidar Membro</span>
            </h3>

            <form onSubmit={handleSendInvite} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs text-gray-300 font-bold uppercase tracking-widest block font-sans">
                  E-mail do Convidado *
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    required
                    disabled={submitLoading}
                    value={emailToInvite}
                    onChange={(e) => setEmailToInvite(e.target.value)}
                    placeholder="exemplo@gmail.com"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30 transition"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-300 font-bold uppercase tracking-widest block font-sans">
                  Função no Sistema (Role) *
                </label>
                <select
                  disabled={submitLoading}
                  value={roleToInvite}
                  onChange={(e) => setRoleToInvite(e.target.value as any)}
                  className="w-full bg-neutral-950 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30 transition min-h-[48px] cursor-pointer"
                >
                  <option value="viewer" className="bg-neutral-900 border-none text-white">Visualizador (Viewer) - Apenas leitura</option>
                  <option value="editor" className="bg-neutral-900 border-none text-white">Editor (Editor) - Criação e edição</option>
                  <option value="admin" className="bg-neutral-900 border-none text-white">Administrador (Admin) - Todo o controle</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] disabled:bg-[#2DD4BF]/40 text-black font-extrabold text-sm py-4 rounded-2xl transition active:scale-95 shadow-[0_4px_12px_rgba(45,212,191,0.2)] cursor-pointer min-h-[44px] flex items-center justify-center space-x-2"
              >
                {submitLoading ? (
                  <div className="w-5 h-5 border-2 border-black/25 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>Enviar Convite de Acesso</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full space-y-6 shadow-2xl animate-scale-up">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl shrink-0 ${
                confirmModal.type === 'danger' 
                  ? 'bg-rose-500/10 text-rose-400' 
                  : confirmModal.type === 'info'
                  ? 'bg-[#2DD4BF]/10 text-[#2DD4BF]'
                  : 'bg-amber-500/10 text-amber-400'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white">{confirmModal.title}</h3>
            </div>
            
            <p className="text-gray-400 text-sm leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white font-bold py-3.5 rounded-2xl text-xs transition active:scale-95 cursor-pointer font-sans"
              >
                {confirmModal.type === 'info' ? 'Ok, entendi' : 'Cancelar'}
              </button>
              {confirmModal.type !== 'info' && (
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className={`flex-1 font-extrabold py-3.5 rounded-2xl text-xs transition active:scale-95 cursor-pointer font-sans ${
                    confirmModal.type === 'danger'
                      ? 'bg-rose-500 hover:bg-rose-600 text-white'
                      : 'bg-[#2DD4BF] hover:bg-[#20bda8] text-black'
                  }`}
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
