import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Sparkles, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { googleSignIn, auth, db } from '../googleAuth';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginProps {
  onLoginSuccess: (user: { name: string; email: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [registerAsAdmin, setRegisterAsAdmin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefererError, setIsRefererError] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field validation touched states
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  // Password Recovery States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  // Real-time Validation Helpers
  const getEmailError = () => {
    if (!email) return 'Por favor, preencha o e-mail.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Formato de e-mail inválido.';
    return null;
  };

  const getPasswordError = () => {
    if (!password) return 'Por favor, preencha a senha.';
    if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    return null;
  };

  const getNameError = () => {
    if (isSignUp && !name) return 'Por favor, preencha o nome completo.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Touch all fields to show any inline validation errors
    setEmailTouched(true);
    setPasswordTouched(true);
    setNameTouched(true);

    const emailErr = getEmailError();
    const passwordErr = getPasswordError();
    const nameErr = getNameError();

    if (emailErr || passwordErr || nameErr) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        // Sign Up with Firebase Auth
        let credential;
        try {
          credential = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(credential.user, { displayName: name });
        } catch (signUpErr: any) {
          if (signUpErr.code === 'auth/email-already-in-use') {
            console.log('E-mail already exists in Firebase Auth. Attempting sign-in fallback instead...');
            try {
              credential = await signInWithEmailAndPassword(auth, email, password);
            } catch (signInErr) {
              console.error('Sign-in fallback failed:', signInErr);
              throw signUpErr; // Throw original signUpErr if password is wrong
            }
          } else {
            throw signUpErr;
          }
        }
        
        // Save profile to Firestore
        // Fire and forget because await setDoc can hang indefinitely if API Key is restricted
        setDoc(doc(db, 'user_profiles', email.toLowerCase()), {
          email: email.toLowerCase(),
          name: name,
          role: registerAsAdmin ? 'admin' : 'member',
          adminEmail: email.toLowerCase(),
          createdAt: new Date().toISOString()
        }).catch(pfErr => {
          console.error('Erro ao salvar profile no Firestore:', pfErr);
        });
        
        // Also save to local user simulation for backward compatibility and fallback
        const usersJson = localStorage.getItem('vall_users');
        let users = usersJson ? JSON.parse(usersJson) : {};
        users[email.toLowerCase()] = { name, password };
        localStorage.setItem('vall_users', JSON.stringify(users));

        // Trigger backend registration workflow (Ação 1 DB sync, Ação 2 Admin email, Ação 3 User email)
        // Fire and forget so we don't block the user login flow
        fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            email: email.toLowerCase(),
            role: registerAsAdmin ? 'admin' : 'member',
            adminEmail: email.toLowerCase()
          })
        }).catch(apiErr => {
          console.error('Erro ao processar fluxo extra de registro no backend:', apiErr);
        });

        onLoginSuccess({ name, email });
      } else {
        // Sign In with Firebase Auth
        const credential = await signInWithEmailAndPassword(auth, email, password);
        
        // Ensure user_profiles has a document for them so things synchronize correctly
        try {
          const profileDocRef = doc(db, 'user_profiles', email.toLowerCase());
          const fetchPromise = getDoc(profileDocRef);
          
          // Race between fetch and timeout so we never hang indefinitely
          const result = await Promise.race([
            fetchPromise,
            new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), 3000))
          ]);

          if (result !== 'TIMEOUT') {
            const profSnap = result;
            if (!profSnap.exists()) {
              // Auto define old/unprofiled users as admin
              setDoc(profileDocRef, {
                email: email.toLowerCase(),
                name: credential.user.displayName || 'Administrador',
                role: 'admin',
                adminEmail: email.toLowerCase(),
                createdAt: new Date().toISOString()
              }).catch(e => console.warn('Silent doc update skipped:', e));
            }
          } else {
            console.warn('Firestore getDoc timed out, continuing login...');
          }
        } catch (profE) {
          console.warn('Silent user profile check/upgrade skipped:', profE);
        }

        onLoginSuccess({ name: credential.user.displayName || 'Administrador', email });

        // Save simulated user details
        const usersJson = localStorage.getItem('vall_users');
        let users = usersJson ? JSON.parse(usersJson) : {};
        users[email.toLowerCase()] = { name: credential.user.displayName || 'Renato Zarvos', password };
        localStorage.setItem('vall_users', JSON.stringify(users));
      }
    } catch (authError: any) {
      console.error('Firebase Auth Error:', authError);
      
      // Specifically handle 'auth/operation-not-allowed' error (Email/Password is disabled in console)
      if (authError.code === 'auth/operation-not-allowed') {
        setErrorMessage(
          'O login com e-mail e senha está desativado no Firebase Console. Por favor, ative a autenticação por "E-mail/senha" (Email/Password) na aba "Authentication" do seu console Firebase para conectar o banco de dados.'
        );
        return;
      }

      // If sign-in failed (for example, user not found, or password invalid)
      if (!isSignUp && (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential')) {
        // Try calling the server-side login fallback API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout
          
          const apiResponse = await fetch('/api/login-fallback', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email.toLowerCase(), password }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (apiResponse.ok) {
            const apiResult = await apiResponse.json();
            if (apiResult.success) {
              // Retry standard Firebase Auth sign-in now that the user is guaranteed to be created
              const retryCredential = await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
              onLoginSuccess({ name: apiResult.name, email: apiResult.email });
              return;
            }
          }
        } catch (apiErr) {
          console.warn('Backend login fallback API failed or offline:', apiErr);
        }

        // Core fallback: search in firestore user_profiles for team members created by Admin (if signed in or database accessible)
        try {
          const fetchRef = getDoc(doc(db, 'user_profiles', email.toLowerCase()));
          const result = await Promise.race([
            fetchRef,
            new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), 3000))
          ]);

          if (result !== 'TIMEOUT' && result.exists()) {
            const up = result.data();
            if (up.password === password) {
              // Lazy recreate Firebase Auth credentials in background so it registers correctly next time!
              try {
                createUserWithEmailAndPassword(auth, email, password).then(subCred => {
                  updateProfile(subCred.user, { displayName: up.name });
                }).catch(regE => {
                  console.warn('Auto Firebase user background registration skipped or already existing:', regE);
                });
              } catch (err) {}
              onLoginSuccess({ name: up.name, email: email.toLowerCase() });
              return;
            }
          }
        } catch (dbErr) {
          console.error('Firestore fallback user profile query failed:', dbErr);
        }

        // Let's check our local storage fallback
        const usersJson = localStorage.getItem('vall_users');
        let users = usersJson ? JSON.parse(usersJson) : {};
        const customUser = users[email.toLowerCase()];

        if (customUser && customUser.password === password) {
          // Local fallback successful, but notify user they need email/password auth enabled
          onLoginSuccess({ name: customUser.name, email });
          return;
        }
      }

      // Show friendly error translation
      let friendlyError = 'Ocorreu um erro ao autenticar. Tente novamente.';
      if (authError.code === 'auth/email-already-in-use') {
        friendlyError = 'Este e-mail já está cadastrado no sistema.';
      } else if (authError.code === 'auth/weak-password') {
        friendlyError = 'A senha fornecida é muito fraca.';
      } else if (authError.code === 'auth/invalid-email') {
        friendlyError = 'O formato do e-mail inserido é inválido.';
      } else if (authError.code === 'auth/user-disabled') {
        friendlyError = 'Esta conta de usuário foi desativada.';
      } else if (authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        friendlyError = 'E-mail ou senha incorretos.';
      }
      setErrorMessage(friendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!forgotEmail) {
      setErrorMessage('Por favor, informe seu e-mail.');
      return;
    }

    const lowerEmail = forgotEmail.trim().toLowerCase();
    const usersJson = localStorage.getItem('vall_users');
    const users = usersJson ? JSON.parse(usersJson) : {};

    const userExists = !!users[lowerEmail];

    if (userExists) {
      setForgotStep(2);
    } else {
      setErrorMessage('E-mail não encontrado ou não cadastrado.');
    }
  };

  const handleForgotStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!forgotNewPassword) {
      setErrorMessage('Por favor, digite sua nova senha.');
      return;
    }

    if (forgotNewPassword.length < 6) {
      setErrorMessage('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    const lowerEmail = forgotEmail.trim().toLowerCase();
    const usersJson = localStorage.getItem('vall_users');
    let users = usersJson ? JSON.parse(usersJson) : {};

    let userName = 'Usuário';
    if (users[lowerEmail]) {
      userName = users[lowerEmail].name || 'Usuário';
    }

    users[lowerEmail] = {
      ...users[lowerEmail],
      name: userName,
      password: forgotNewPassword
    };

    localStorage.setItem('vall_users', JSON.stringify(users));
    setSuccessMessage('Senha redefinida com sucesso!');

    setTimeout(() => {
      setEmail(forgotEmail);
      setIsForgotPassword(false);
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 2000);
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsRefererError(false);
    setIsGoogleLoading(true);
    console.log('[LoginUI] Iniciando processo de login com o Google...');
    try {
      const result = await googleSignIn();
      if (result && result.user) {
        console.log('[LoginUI] Sucesso no login com o Google. Redirecionando usuário...');
        onLoginSuccess({
          name: result.user.displayName || 'Usuário Google',
          email: result.user.email || ''
        });
      }
    } catch (err: any) {
      console.error('[LoginUI] Falha ao tentar autenticar via Google:', err);
      
      const errorCode = err?.code || '';
      const errorMessageString = err?.message || '';
      
      if (errorCode.includes('requests-from-referer') || errorMessageString.includes('requests-from-referer') || errorMessageString.includes('referer')) {
        setIsRefererError(true);
        setErrorMessage('Acesso bloqueado: o domínio atual não está autorizado nas restrições de chave do seu Console Google Cloud.');
      } else if (errorCode === 'auth/operation-not-allowed') {
        setErrorMessage('O login do Google está desativado no Firebase. Ative em "Authentication > Sign-in method" no Console Firebase.');
      } else if (errorCode === 'auth/popup-blocked') {
        setErrorMessage('O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups nesta página ou tente usar e-mail e senha.');
      } else if (errorCode === 'auth/popup-closed-by-user') {
        setErrorMessage('A janela pop-up de autenticação com o Google foi fechada antes de concluir o login. Clique em "Google" novamente para realizar o fluxo por completo.');
      } else if (errorCode === 'auth/cancelled-popup-request') {
        setErrorMessage('A solicitação de autenticação foi reiniciada. Aguarde ou feche outras telas abertas e tente novamente.');
      } else if (errorCode === 'auth/network-request-failed') {
        setErrorMessage('Falha de rede ao tentar se comunicar com o Firebase Auth. Verifique seu sinal de internet ou se o seu dispositivo está offline.');
      } else if (errorCode === 'auth/internal-error') {
        setErrorMessage('Erro interno no Firebase Auth. Verifique sua conexão ou limpe os cookies do navegador.');
      } else if (errorMessageString.includes('invalid') || errorCode.includes('invalid-action') || errorCode.includes('invalid-credential')) {
        setErrorMessage('Erro de Ação Inválida / Credenciais Inválidas. Certifique-se de que o provedor Google está habilitado com os Redirect URIs corretos no Console do Google Cloud e Firebase.');
      } else {
        setErrorMessage(`Não foi possível entrar com o Google. Erro (${errorCode || 'Desconhecido'}): ${errorMessageString || 'Certifique-se de que o provedor Google está ativado no Console Firebase.'}`);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712] text-[#f8fafc] font-sans flex flex-col justify-between max-w-md mx-auto border-x border-white/5 shadow-2xl relative select-none overflow-hidden">
      
      {/* Background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-[#2DD4BF]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header section with brand identity */}
      <header className="p-10 flex flex-col items-center text-center mt-8 relative z-10">
        <div className="w-16 h-16 bg-[#2DD4BF] rounded-2xl flex items-center justify-center font-black text-black text-3xl italic select-none shadow-[0_0_30px_rgba(45,212,191,0.3)] mb-4 animate-pulse">
          V
        </div>
        <div>
          <p className="text-[#2DD4BF] text-[11px] tracking-[0.3em] font-bold mb-1 uppercase font-mono">
            Sistema de Gestão
          </p>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white select-none">
            Vall
          </h1>
        </div>
      </header>

      {/* Login Card */}
      <main className="px-6 flex-1 flex flex-col justify-center relative z-10 w-full">
        <div className="glass border border-white/10 rounded-[2.5rem] p-6 shadow-2xl bg-black/40 backdrop-blur-xl relative">
          
          {/* Card Top Pill/Mode Switcher */}
          {!isForgotPassword && (
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 mb-6">
              <button
                onClick={() => {
                  setIsSignUp(false);
                  setErrorMessage(null);
                  setEmailTouched(false);
                  setPasswordTouched(false);
                  setNameTouched(false);
                }}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer ${
                  !isSignUp
                    ? 'bg-white/10 text-[#2DD4BF] shadow-lg'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Entrar
              </button>
              <button
                onClick={() => {
                  setIsSignUp(true);
                  setErrorMessage(null);
                  setEmailTouched(false);
                  setPasswordTouched(false);
                  setNameTouched(false);
                }}
                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer ${
                  isSignUp
                    ? 'bg-white/10 text-[#2DD4BF] shadow-lg'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Criar Conta
              </button>
            </div>
          )}

          {isForgotPassword ? (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h3 className="text-lg font-bold text-[#2DD4BF] uppercase tracking-wider font-mono">
                  Recuperar Senha
                </h3>
                <p className="text-xs text-gray-300 mt-1">
                  {forgotStep === 1 
                    ? "Informe o e-mail de acesso para encontrar seu cadastro."
                    : "Sua conta do VALL foi localizada! Crie uma nova senha de acesso abaixo:"
                  }
                </p>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-[#EF4444]/15 border border-[#EF4444]/20 text-[#FCA5A5] text-sm rounded-xl p-3 text-center font-mono font-medium">
                  {errorMessage}
                </div>
              )}

              {/* Success Message */}
              {successMessage && (
                <div className="bg-[#10B981]/15 border border-[#10B981]/20 text-[#A7F3D0] text-sm rounded-xl p-3 text-center font-mono font-medium">
                  {successMessage}
                </div>
              )}

              {forgotStep === 1 ? (
                <form onSubmit={handleForgotStep1} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                      E-mail do Cadastro
                    </label>
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px]">
                      <Mail className="text-gray-300 mr-2 shrink-0" size={18} />
                      <input
                        type="email"
                        required
                        inputMode="email"
                        autoComplete="email"
                        placeholder="seu@email.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-4 bg-[#2DD4BF] text-black py-4 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(45,212,191,0.25)] hover:shadow-[0_0_35px_rgba(45,212,191,0.45)] hover:scale-[1.02] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <span>Verificar Cadastro</span>
                    <ArrowRight size={14} />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotStep2} className="space-y-4">
                  <div className="space-y-1.5 border-b border-white/5 pb-2">
                    <span className="text-gray-300 text-xs font-bold uppercase tracking-wider">Conta Vinculada</span>
                    <p className="text-base font-semibold font-mono text-emerald-400 mt-0.5">{forgotEmail}</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                      Nova Senha de Acesso
                    </label>
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/55 transition-all min-h-[48px]">
                      <Lock className="text-gray-300 mr-2 shrink-0" size={18} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Mínimo de 6 caracteres"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-300 hover:text-white transition cursor-pointer shrink-0 p-2.5 -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-4 bg-[#2DD4BF] text-black py-4 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(45,212,191,0.25)] hover:shadow-[0_0_35px_rgba(45,212,191,0.45)] hover:scale-[1.02] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <span>Salvar Nova Senha</span>
                    <ArrowRight size={14} />
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-sm text-gray-300 hover:text-white transition underline decoration-dotted cursor-pointer py-3.5 inline-block"
                >
                  Voltar para o Login
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Error Message */}
              {errorMessage && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl p-3 text-center font-mono font-medium">
                  {errorMessage}
                </div>
              )}

              {errorMessage && isRefererError && (
                <div className="bg-amber-500/5 border border-amber-500/15 text-gray-300 text-xs rounded-2xl p-4 mt-2 space-y-3 font-sans text-left leading-relaxed animate-fade-in max-h-[300px] overflow-y-auto">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px] font-mono">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Tutorial: Como Resolver Agora</span>
                  </div>
                  <p className="text-gray-300">
                    Você quase acertou nas configurações! Mas faltam os asteriscos (<span className="text-amber-400 font-bold">/*</span>) no final das URLs e também o domínio interno do Firebase.
                  </p>
                  
                  <div className="space-y-2.5 pt-1">
                    <div className="flex gap-2">
                      <span className="text-amber-400 font-bold font-mono text-xs shrink-0 bg-amber-500/10 w-5 h-5 rounded-full flex items-center justify-center">1</span>
                      <p>
                        Acesse as restrições da sua chave no <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-[#2DD4BF] hover:underline font-semibold">Google Cloud Console</a>.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <span className="text-amber-400 font-bold font-mono text-xs shrink-0 bg-amber-500/10 w-5 h-5 rounded-full flex items-center justify-center">2</span>
                      <p>
                        Nas URLs que você adicionou, <strong className="text-white">você esqueceu o /* no final</strong>! Edite cada uma delas para ficarem exatamente assim:
                      </p>
                    </div>

                    <div className="pl-6 space-y-2">
                      <div className="bg-black/40 p-2 rounded border border-red-500/30 text-gray-400 line-through text-[10px]">
                        Errado: https://ais-dev-...us-west2.run.app/
                      </div>
                      <div className="bg-[#2DD4BF]/10 p-2 rounded border border-[#2DD4BF]/30 text-white font-mono text-[10px]">
                        Certo: https://ais-dev-...us-west2.run.app<strong className="text-amber-400 text-sm">/*</strong>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <span className="text-amber-400 font-bold font-mono text-xs shrink-0 bg-amber-500/10 w-5 h-5 rounded-full flex items-center justify-center">3</span>
                      <div className="space-y-2 w-full">
                        <p>Você também <strong className="text-amber-500 uppercase">PRECISA</strong> adicionar o domínio de popup do Firebase. Adicione este item novo na lista:</p>
                        
                        <div 
                          onClick={() => {
                            navigator.clipboard.writeText(`https://appvall-497716.firebaseapp.com/*`);
                            setCopiedOrigin(true);
                            setTimeout(() => setCopiedOrigin(false), 2000);
                          }}
                          className="bg-black/50 p-2.5 rounded-xl border border-amber-500/50 font-mono text-[11px] text-[#2DD4BF] break-all select-all flex justify-between items-center group cursor-pointer hover:border-amber-400 transition active:scale-[0.98]"
                        >
                          <span className="select-all block">https://appvall-497716.firebaseapp.com/*</span>
                          <span className="text-[9px] text-gray-400 group-hover:text-amber-400 transition ml-2 shrink-0 border border-gray-700 rounded px-1.5 py-0.5 uppercase font-bold font-mono">
                            {copiedOrigin ? 'Copiado!' : 'Copiar'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <span className="text-amber-400 font-bold font-mono text-xs shrink-0 bg-amber-500/10 w-5 h-5 rounded-full flex items-center justify-center">4</span>
                      <p>
                        Por via das dúvidas, adicione este aqui também (clique para copiar):
                      </p>
                    </div>
                    
                    <div className="pl-6 pb-2">
                        <div 
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/*`);
                          }}
                          className="bg-black/50 p-2 rounded border border-white/10 font-mono text-[10px] text-gray-300 cursor-pointer hover:border-[#2DD4BF]/50"
                        >
                          <span className="select-all block">{window.location.origin}/*</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                      <span className="text-amber-400 font-bold font-mono text-xs shrink-0 bg-amber-500/10 w-5 h-5 rounded-full flex items-center justify-center">5</span>
                      <p>
                        Clique em <span className="font-semibold text-white">Salvar</span>, aguarde 5 minutos e tente novamente. <br/><span className="text-[10px] text-gray-400">(Sério, não esquece do <span className="text-amber-400 font-bold">/*</span> no final de todas elas!)</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom full Name Input - Register Mode */}
              {isSignUp && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                      Nome Completo
                    </label>
                    <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px] ${
                      nameTouched && getNameError() ? 'border-rose-500/50 focus-within:border-rose-500/70' : 'border-white/10'
                    }`}>
                      <UserIcon className="text-gray-300 mr-2 shrink-0" size={18} />
                      <input
                        type="text"
                        required
                        disabled={isSubmitting || isGoogleLoading}
                        placeholder="Seu nome"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          setNameTouched(true);
                        }}
                        onBlur={() => setNameTouched(true)}
                        className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-sans disabled:opacity-50"
                      />
                    </div>
                    {nameTouched && getNameError() && (
                      <p className="text-xs text-rose-400 font-mono mt-1 text-left animate-fade-in pl-1">
                        • {getNameError()}
                      </p>
                    )}
                  </div>

                  {/* Register as Administrator Toggle */}
                  <div className="flex items-center space-x-3 p-3.5 bg-white/5 border border-white/5 rounded-2xl select-none">
                    <input
                      type="checkbox"
                      id="register_as_admin"
                      checked={registerAsAdmin}
                      onChange={(e) => setRegisterAsAdmin(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent text-[#2DD4BF] focus:ring-[#2DD4BF] focus:ring-offset-0 cursor-pointer"
                    />
                    <label htmlFor="register_as_admin" className="text-[11px] text-gray-200 leading-tight cursor-pointer">
                      <strong className="text-white">Cadastrar como Administrador</strong>
                      <span className="block text-[9px] text-gray-400 mt-0.5">Permite herdar painel e gerenciar equipe coletiva de até 4 pessoas.</span>
                    </label>
                  </div>
                </>
              )}

              {/* Email Address Input */}
              <div className="space-y-1.5">
                <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                  E-mail
                </label>
                <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px] ${
                  emailTouched && getEmailError() ? 'border-rose-500/50 focus-within:border-rose-500/70' : 'border-white/10'
                }`}>
                  <Mail className="text-gray-300 mr-2 shrink-0" size={18} />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    disabled={isSubmitting || isGoogleLoading}
                    placeholder={isSignUp ? "exemplo@email.com" : "seu@email.com"}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailTouched(true);
                    }}
                    onBlur={() => setEmailTouched(true)}
                    className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono disabled:opacity-50"
                  />
                </div>
                {emailTouched && getEmailError() && (
                  <p className="text-xs text-rose-400 font-mono mt-1 text-left animate-fade-in pl-1">
                    • {getEmailError()}
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                  Senha
                </label>
                <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px] ${
                  passwordTouched && getPasswordError() ? 'border-rose-500/50 focus-within:border-rose-500/70' : 'border-white/10'
                }`}>
                  <Lock className="text-gray-300 mr-2 shrink-0" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isSubmitting || isGoogleLoading}
                    placeholder={isSignUp ? "Crie sua senha (mín. 6 dgt)" : "Sua senha segura"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordTouched(true);
                    }}
                    onBlur={() => setPasswordTouched(true)}
                    className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={isSubmitting || isGoogleLoading}
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-300 hover:text-white transition cursor-pointer shrink-0 p-2.5 -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordTouched && getPasswordError() && (
                  <p className="text-xs text-rose-400 font-mono mt-1 text-left animate-fade-in pl-1">
                    • {getPasswordError()}
                  </p>
                )}
              </div>

              {/* Esqueceu sua senha Link */}
              {!isSignUp && (
                <div className="text-right">
                  <button
                    type="button"
                    disabled={isSubmitting || isGoogleLoading}
                    onClick={() => {
                      setIsForgotPassword(true);
                      setForgotStep(1);
                      setForgotEmail(email);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-sm text-[#2DD4BF] hover:text-[#5eead4] hover:underline transition cursor-pointer font-semibold py-2 inline-block disabled:opacity-50"
                  >
                    Esqueceu sua senha?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="w-full mt-4 bg-[#2DD4BF] text-black py-4 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(45,212,191,0.25)] hover:shadow-[0_0_35px_rgba(45,212,191,0.45)] hover:scale-[1.02] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black/35 border-t-black rounded-full animate-spin mr-1" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>{isSignUp ? 'Cadastrar e Entrar' : 'Acessar Painel'}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Google OAuth Divisor */}
          {!isForgotPassword && (
            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-white/10"></div>
              <span className="px-3 text-xs text-gray-300 font-mono uppercase tracking-wider">ou</span>
              <div className="flex-1 border-t border-white/10"></div>
            </div>
          )}

          {/* Official Google Sign-In button */}
          {!isForgotPassword && (
            <div className="space-y-2">
              <div className="text-[10px] text-center text-[#2DD4BF] font-bold font-mono tracking-wider flex items-center justify-center gap-1">
                <span>⚡ RECOMENDADO: LOGIN + CONEXÃO DA AGENDA</span>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full bg-[#2DD4BF]/5 hover:bg-[#2DD4BF]/10 border border-[#2DD4BF]/25 hover:border-[#2DD4BF]/50 active:scale-95 transition-all rounded-2xl py-3.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 text-[#2DD4BF] min-h-[48px] cursor-pointer disabled:opacity-50"
              >
                {isGoogleLoading ? (
                  <span className="w-4.5 h-4.5 border-2 border-white/20 border-t-[#2DD4BF] rounded-full animate-spin mr-1" />
                ) : (
                  <svg className="w-4 h-4 shrink-0 mr-1" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Entrar com o Google</span>
              </button>
            </div>
          )}


        </div>
      </main>

      {/* Footer Details */}
      <footer className="p-8 text-center text-[10px] text-gray-300 font-mono relative z-10 w-full">
        <p>© 2026 VALL. Todos os direitos reservados.</p>
        <p className="mt-1 text-[#2DD4BF]/85">Conexão TLS encriptada e segura.</p>
      </footer>
    </div>
  );
}
