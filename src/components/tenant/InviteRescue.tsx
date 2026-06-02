import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db, googleSignIn, handleFirestoreError, OperationType } from '../../googleAuth';
import { ShieldCheck, LogIn, Sparkles, HelpCircle, CheckCircle, ArrowRight, Star, Mail } from 'lucide-react';

export default function InviteRescue() {
  const { user, organizationId } = useTenant();
  
  // Extract invite ID from URL parameter search: ?id=XYZ
  const [inviteId, setInviteId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
  });
  
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [processingAccept, setProcessingAccept] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Checks and loads the invite details
  const checkInvite = async (id: string) => {
    if (!id.trim()) return;
    
    setCheckingInvite(true);
    setErrorMessage(null);
    setInviteData(null);

    try {
      const inviteRef = doc(db, 'invites', id.trim());
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        setErrorMessage('Este convite não foi encontrado. Por favor, verifique o código ou link.');
        setCheckingInvite(false);
        return;
      }

      const data = inviteSnap.data();
      if (data.status !== 'pending') {
        setErrorMessage(`Este convite já foi ${data.status === 'accepted' ? 'aceito' : 'recusado ou cancelado'}.`);
        setCheckingInvite(false);
        return;
      }

      setInviteData(data);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, `invites/${id}`);
      setErrorMessage('Erro ao buscar metadados do convite.');
    } finally {
      setCheckingInvite(false);
    }
  };

  // Run automatically if invite ID exists in URL query on mount
  useEffect(() => {
    if (inviteId) {
      checkInvite(inviteId);
    }
  }, []);

  const handleSignIn = async () => {
    try {
      setErrorMessage(null);
      await googleSignIn();
    } catch (err: any) {
      setErrorMessage('Falha ao autenticar com Google.');
    }
  };

  // atomic Transaction flow satisfying the exact requested logic
  const handleAcceptInvite = async () => {
    if (!user || !inviteId || !inviteData) return;

    setProcessingAccept(true);
    setErrorMessage(null);

    const inviteRef = doc(db, 'invites', inviteId.trim());
    const userRef = doc(db, 'users', user.uid);
    const memberRef = doc(db, 'organizations', inviteData.organizationId, 'members', user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Fetch current invite status inside transaction for total safety
        const inviteSnapshot = await transaction.get(inviteRef);
        if (!inviteSnapshot.exists()) {
          throw new Error('Convite inválido ou excluído.');
        }

        const freshInvite = inviteSnapshot.data();
        if (freshInvite.status !== 'pending') {
          throw new Error(`Este convite já foi ${freshInvite.status === 'accepted' ? 'aceito' : 'cancelado'}.`);
        }

        // 2. Mark invite as accepted
        transaction.update(inviteRef, {
          status: 'accepted',
          acceptedByUid: user.uid,
          acceptedByEmail: user.email || '',
          acceptedAt: new Date().toISOString()
        });

        // 3. Update User document with the organization relation
        transaction.set(userRef, {
          organizationId: inviteData.organizationId,
          email: user.email || '',
          displayName: user.displayName || 'Membro'
        }, { merge: true });

        // 4. Create Member document inside organization's members subcollection
        transaction.set(memberRef, {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Membro',
          role: inviteData.role,
          joinedAt: new Date().toISOString()
        });
      });

      setCompleted(true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `invites/${inviteId}`);
      setErrorMessage(err.message || 'Falha ao aceitar o convite.');
    } finally {
      setProcessingAccept(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4 animate-fade-in space-y-8">
      
      {/* Visual Identity Logo */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center bg-[#2DD4BF]/10 w-16 h-16 rounded-[2rem] border border-[#2DD4BF]/20 shadow-[0_4px_15px_rgba(45,212,191,0.1)] text-[#2DD4BF] text-2xl font-black">
          V
        </div>
        <h2 className="text-xs bg-white/5 border border-white/5 text-gray-400 font-mono font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-full inline-block">
          Módulo Multi-Tenant
        </h2>
      </div>

      {/* Main card */}
      <div className="bg-neutral-900 border border-white/5 p-6 md:p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden space-y-6">
        
        {/* Decorative ambient background accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#2DD4BF]/5 rounded-full blur-3xl pointer-events-none" />

        {errorMessage && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl text-xs font-semibold">
            {errorMessage}
          </div>
        )}

        {completed ? (
          <div className="text-center space-y-6 py-6 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-500/15 text-[#4ade80] rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase text-white tracking-tight">Convite Aceito!</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Você ingressou na organização <strong className="text-white">{inviteData?.organizationName}</strong> como <strong className="text-[#2DD4BF] uppercase">{inviteData?.role}</strong>.
              </p>
            </div>
            <button
              onClick={() => {
                // Navigate home or reset search query dynamically
                window.location.search = '';
              }}
              className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] text-black font-extrabold text-sm py-4 rounded-2xl transition active:scale-95 shadow-[0_4px_12px_rgba(45,212,191,0.2)]"
            >
              Ir para o Dashboard Principal
            </button>
          </div>
        ) : !inviteId ? (
          /* Manual ID view in case of missing search param */
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-lg font-extrabold text-white">Insira o Código do Convite</h3>
              <p className="text-gray-400 text-xs">Insira o ID do convite recebido para ingressar no time da sua empresa.</p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Exemplo: inv_1234567"
                value={inviteId}
                onChange={(e) => setInviteId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-base text-white focus:outline-none focus:border-[#2DD4BF]"
              />
              <button
                onClick={() => checkInvite(inviteId)}
                disabled={!inviteId.trim() || checkingInvite}
                className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] disabled:bg-[#2DD4BF]/40 text-black font-extrabold text-sm py-4 rounded-2xl transition active:scale-95"
              >
                {checkingInvite ? 'Buscando...' : 'Verificar Convite'}
              </button>
            </div>
          </div>
        ) : checkingInvite ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-10 h-10 border-4 border-[#2DD4BF]/20 border-t-[#2DD4BF] rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-400 text-xs font-mono">Buscando convite no banco de dados...</p>
          </div>
        ) : inviteData ? (
          /* Invite Details and Identity Verification */
          <div className="space-y-6">
            <div className="space-y-2 bg-white/5 border border-white/5 rounded-2.5xl p-5 relative">
              <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest block font-mono mb-1">Empresa Convidante</div>
              <h4 className="text-xl font-extrabold text-white leading-tight">{inviteData.organizationName}</h4>
              <div className="mt-4 flex flex-wrap gap-2 items-center text-xs text-gray-400">
                <span className="font-mono bg-[#2DD4BF]/10 text-[#2DD4BF] border border-[#2DD4BF]/20 rounded-md px-2 py-0.5 uppercase font-bold text-[9px] tracking-widest">{inviteData.role}</span>
                <span>•</span>
                <span>Remetente: {inviteData.invitedByEmail}</span>
              </div>
            </div>

            {!user ? (
              /* User not logged in: display GoogleAuthProvider credentials */
              <div className="space-y-4">
                <p className="text-gray-400 text-xs text-center leading-relaxed">
                  Para aceitar o convite, você precisa fazer login. Use o mesmo email que recebeu o link (<strong className="text-white">{inviteData.email}</strong>).
                </p>
                <button
                  onClick={handleSignIn}
                  className="w-full bg-white text-black hover:bg-neutral-200 font-extrabold text-sm py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-3 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Logar com Google</span>
                </button>
              </div>
            ) : (
              /* User logged in: Accept Invitation module */
              <div className="space-y-4">
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl flex items-start gap-3">
                  <Star className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-400 leading-relaxed">
                    Você está logado como <strong className="text-white">{user.email}</strong>. 
                    Certifique-se de que este é o email correto correspondente às permissões do convite.
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleAcceptInvite}
                    disabled={processingAccept}
                    className="w-full bg-[#2DD4BF] hover:bg-[#20bda8] text-black font-extrabold text-sm py-4 rounded-2xl transition active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {processingAccept ? (
                      <div className="w-5 h-5 border-2 border-black/25 border-t-black rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>Ingressar na Organização</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setInviteId('')}
                    className="w-full border border-white/10 text-gray-400 hover:text-white text-xs py-3 rounded-2xl hover:bg-white/5 transition"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <HelpCircle className="w-12 h-12 text-gray-600 mx-auto" />
            <p className="text-gray-400 text-sm">Insira ou localize um convite pendente para iniciar.</p>
          </div>
        )}

      </div>
    </div>
  );
}
