import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Sparkles, User as UserIcon, ArrowRight } from 'lucide-react';
import { googleSignIn } from '../googleAuth';

interface LoginProps {
  onLoginSuccess: (user: { name: string; email: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Password Recovery States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password || (isSignUp && !name)) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (password.length < 4) {
      setErrorMessage('A senha deve ter pelo menos 4 caracteres.');
      return;
    }

    // Simulated login/signup state save
    const usersJson = localStorage.getItem('vall_users');
    let users = usersJson ? JSON.parse(usersJson) : {};

    if (isSignUp) {
      if (users[email.toLowerCase()]) {
        setErrorMessage('Este e-mail já está cadastrado.');
        return;
      }
      users[email.toLowerCase()] = { name, password };
      localStorage.setItem('vall_users', JSON.stringify(users));
      onLoginSuccess({ name, email });
    } else {
      // Check default mock user or saved users
      const lowerEmail = email.toLowerCase();
      const customUser = users[lowerEmail];
      const defaultPassword = lowerEmail === 'renatobz@gmail.com'
        ? (customUser ? customUser.password : '1234')
        : (customUser?.password);

      if (customUser && customUser.password === password) {
        onLoginSuccess({ name: customUser.name, email });
      } else if (lowerEmail === 'renatobz@gmail.com' && password === defaultPassword) {
        onLoginSuccess({ name: 'Renato Zarvos', email: 'renatobz@gmail.com' });
      } else {
        setErrorMessage(`E-mail ou senha incorretos. (Dica de teste: renatobz@gmail.com / ${defaultPassword})`);
      }
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

    const userExists = lowerEmail === 'renatobz@gmail.com' || !!users[lowerEmail];

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

    if (forgotNewPassword.length < 4) {
      setErrorMessage('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }

    const lowerEmail = forgotEmail.trim().toLowerCase();
    const usersJson = localStorage.getItem('vall_users');
    let users = usersJson ? JSON.parse(usersJson) : {};

    let userName = 'Usuário';
    if (lowerEmail === 'renatobz@gmail.com') {
      userName = 'Renato Zarvos';
    } else if (users[lowerEmail]) {
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

  const handleQuickLogin = () => {
    // Check if there is an overridden password
    const usersJson = localStorage.getItem('vall_users');
    let users = usersJson ? JSON.parse(usersJson) : {};
    const customUser = users['renatobz@gmail.com'];
    const currentPassword = customUser ? customUser.password : '1234';

    setEmail('renatobz@gmail.com');
    setPassword(currentPassword);
    onLoginSuccess({ name: 'Renato Zarvos', email: 'renatobz@gmail.com' });
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const result = await googleSignIn();
      if (result && result.user) {
        onLoginSuccess({
          name: result.user.displayName || 'Usuário Google',
          email: result.user.email || ''
        });
      }
    } catch (err: any) {
      console.error('Falha no login com Google:', err);
      setErrorMessage('Não foi possível entrar com o Google. Tente novamente.');
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
                        placeholder="renatobz@gmail.com"
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
                        placeholder="Mínimo de 4 caracteres"
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

              {/* Custom full Name Input - Register Mode */}
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                    Nome Completo
                  </label>
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px]">
                    <UserIcon className="text-gray-300 mr-2 shrink-0" size={18} />
                    <input
                      type="text"
                      required
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-sans"
                    />
                  </div>
                </div>
              )}

              {/* Email Address Input */}
              <div className="space-y-1.5">
                <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                  E-mail
                </label>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px]">
                  <Mail className="text-gray-300 mr-2 shrink-0" size={18} />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    placeholder={isSignUp ? "exemplo@email.com" : "renatobz@gmail.com"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                  Senha
                </label>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-[#2DD4BF]/50 transition-all min-h-[48px]">
                  <Lock className="text-gray-300 mr-2 shrink-0" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder={isSignUp ? "Crie sua senha (mín. 4 dgt)" : "Sua senha segura"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              {/* Esqueceu sua senha Link */}
              {!isSignUp && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setForgotStep(1);
                      setForgotEmail(email);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-sm text-[#2DD4BF] hover:text-[#5eead4] hover:underline transition cursor-pointer font-semibold py-2 inline-block"
                  >
                    Esqueceu sua senha?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full mt-4 bg-[#2DD4BF] text-black py-4 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(45,212,191,0.25)] hover:shadow-[0_0_35px_rgba(45,212,191,0.45)] hover:scale-[1.02] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[48px]"
              >
                <span>{isSignUp ? 'Cadastrar e Entrar' : 'Acessar Painel'}</span>
                <ArrowRight size={14} />
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
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading}
              className="w-full bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all rounded-2xl py-3.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 text-white min-h-[48px] cursor-pointer disabled:opacity-50"
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
          )}

          {/* Quick Demo Bypass Access */}
          {!isSignUp && !isForgotPassword && (
            <div className="mt-5 pt-4 border-t border-white/5 text-center">
              <button
                onClick={handleQuickLogin}
                className="inline-flex items-center space-x-1.5 text-sm text-[#2DD4BF] hover:text-[#5eead4] font-semibold transition cursor-pointer py-3.5 px-4 rounded-xl hover:bg-white/5"
              >
                <Sparkles size={14} className="text-[#2DD4BF]" />
                <span className="underline decoration-dotted block">Entrar rápido como Renato Zarvos</span>
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
