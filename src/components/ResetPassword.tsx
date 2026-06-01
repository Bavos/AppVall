import React, { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface ResetPasswordProps {
  onBackToLogin: () => void;
}

export default function ResetPassword({ onBackToLogin }: ResetPasswordProps) {
  // Extract parameters from URL
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token') || '';
  const urlEmail = searchParams.get('email') || '';

  const [inputEmail, setInputEmail] = useState(urlEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validation States
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Token Validation
  const isTokenValid = () => {
    if (!token) return false;
    // For a real security layer, a token must be at least 6 characters and valid alphanumeric/hyphen/underscore
    const tokenRegex = /^[a-zA-Z0-9_\-]{6,}$/;
    return tokenRegex.test(token);
  };

  // Field error helpers
  const getEmailError = () => {
    if (!inputEmail) return 'O e-mail é obrigatório para redefinir a senha.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inputEmail)) return 'Formato de e-mail inválido.';
    return null;
  };

  const getPasswordError = () => {
    if (!newPassword) return 'Por favor, digite sua nova senha.';
    if (newPassword.length < 4) return 'A senha deve ter pelo menos 4 caracteres.';
    return null;
  };

  const getConfirmPasswordError = () => {
    if (!confirmPassword) return 'Por favor, confirme sua nova senha.';
    if (confirmPassword !== newPassword) return 'As senhas inseridas não coincidem.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Touch all fields
    setEmailTouched(true);
    setPasswordTouched(true);
    setConfirmTouched(true);

    const emailErr = getEmailError();
    const passwordErr = getPasswordError();
    const confirmErr = getConfirmPasswordError();

    if (emailErr || passwordErr || confirmErr) {
      return;
    }

    if (!isTokenValid()) {
      setErrorMessage('Token de redefinição inválido ou expirado.');
      return;
    }

    setIsSubmitting(true);

    // Simulate database / server delay
    setTimeout(() => {
      try {
        const lowerEmail = inputEmail.trim().toLowerCase();
        const usersJson = localStorage.getItem('vall_users');
        let users = usersJson ? JSON.parse(usersJson) : {};

        const userExists = lowerEmail === 'renatobz@gmail.com' || !!users[lowerEmail];

        if (!userExists) {
          setErrorMessage('Cadastro não encontrado para o e-mail informado.');
          setIsSubmitting(false);
          return;
        }

        // Reset password in local state
        let userName = 'Usuário';
        if (lowerEmail === 'renatobz@gmail.com') {
          userName = 'Renato Zarvos';
        } else if (users[lowerEmail]) {
          userName = users[lowerEmail].name || 'Usuário';
        }

        users[lowerEmail] = {
          ...users[lowerEmail],
          name: userName,
          password: newPassword
        };

        localStorage.setItem('vall_users', JSON.stringify(users));
        setSuccessMessage('Sua senha foi redefinida com sucesso!');
        setCountdown(3);
        setIsSubmitting(false);
      } catch (err) {
        console.error('Password reset error:', err);
        setErrorMessage('Ocorreu um erro ao salvar a nova senha. Tente novamente.');
        setIsSubmitting(false);
      }
    }, 1500);
  };

  // Redirection countdown effect
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      // Clear the url search flags first to clear token/reset states and avoid looping
      window.history.replaceState({}, document.title, window.location.pathname === '/reset-password' ? '/' : window.location.pathname);
      onBackToLogin();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, onBackToLogin]);

  return (
    <div className="flex-1 flex flex-col justify-center min-h-[90vh]">
      {/* Upper Logo / Title */}
      <header className="p-6 flex flex-col items-center justify-center relative z-10" id="reset_pass_header">
        <div className="flex flex-col items-center justify-center">
          <p className="text-[#2DD4BF] text-[10px] tracking-[0.25em] font-bold mb-1 uppercase font-mono">
            Portal de Segurança
          </p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2DD4BF] rounded-lg flex items-center justify-center font-black text-black text-lg italic select-none">V</div>
            <h1 className="text-3xl font-black italic tracking-tighter uppercase text-white select-none">Vall</h1>
          </div>
        </div>
      </header>

      <main className="px-6 flex-1 flex flex-col justify-center relative z-10 w-full mb-12">
        <div className="glass border border-white/10 rounded-[2.5rem] p-6 shadow-2xl bg-black/40 backdrop-blur-xl relative">
          
          {!isTokenValid() ? (
            /* Expired/Invalid token screen */
            <div className="space-y-6 text-center py-4">
              <div className="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center text-rose-400 animate-pulse">
                <AlertTriangle size={32} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-rose-400 uppercase tracking-wider font-mono">
                  Sessão Inválida
                </h3>
                <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                  Não foi possível validar o seu token de redefinição de senha para o Vall.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left text-xs space-y-2 text-gray-400 font-mono">
                <p className="font-bold text-gray-300">• Causas Possíveis:</p>
                <p>1. O token de recuperação expirou após 1 hora.</p>
                <p>2. O link de redefinição de senha já foi utilizado.</p>
                <p>3. O formato do parâmetro <code className="text-[#2DD4BF]">token</code> está inválido.</p>
              </div>

              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold py-4 rounded-2xl font-mono text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer max-h-[48px] flex items-center justify-center"
              >
                Voltar ao Login
              </button>
            </div>
          ) : successMessage ? (
            /* Success Feedback Card */
            <div className="space-y-6 text-center py-6 animate-fade-in">
              <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-[#2DD4BF]">
                <CheckCircle2 size={36} className="animate-bounce" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-white italic uppercase tracking-wider font-mono">
                  Redefinição Concluída
                </h3>
                <p className="text-sm text-emerald-400 font-bold font-sans">
                  {successMessage}
                </p>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
                Sua credencial de acesso foi alterada de maneira segura no banco de dados. Você será redirecionado para o painel de login em:
              </p>

              <div className="flex justify-center items-center">
                <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center text-2xl font-black text-[#2DD4BF] border border-[#2DD4BF]/20 shadow-[0_0_15px_rgba(45,212,191,0.2)] font-mono">
                  {countdown}
                </div>
              </div>
            </div>
          ) : (
            /* Form Screen */
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h3 className="text-lg font-bold text-[#2DD4BF] uppercase tracking-wider font-mono flex items-center justify-center gap-1.5">
                  Nova Senha
                </h3>
                <p className="text-xs text-gray-300 mt-1">
                  Insira o e-mail da sua conta correspondente e crie uma senha segura para restabelecer seu acesso.
                </p>
              </div>

              {/* Informational Token Indicator */}
              <div className="bg-emerald-500/10 border border-[#2DD4BF]/20 rounded-2xl p-3.5 flex items-center space-x-2 text-left">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-ping shrink-0" />
                <p className="text-[10px] text-gray-300 font-mono tracking-wide leading-relaxed">
                  Token Identificado: <span className="text-[#2DD4BF] font-bold">{token.slice(0, 5)}...{token.slice(-5)}</span> (Sessão Segura)
                </p>
              </div>

              {/* Global Error Banner */}
              {errorMessage && (
                <div className="bg-rose-500/15 border border-rose-500/20 text-rose-200 text-xs rounded-xl p-3.5 text-center font-mono font-medium leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email (Readonly if given in URL, editable if missing) */}
                <div className="space-y-1.5">
                  <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                    E-mail do Cadastro
                  </label>
                  <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 transition-all min-h-[48px] ${
                    urlEmail 
                      ? 'opacity-85 border-white/5' 
                      : (emailTouched && getEmailError() 
                        ? 'border-rose-500/50 focus-within:border-rose-500/70' 
                        : 'border-white/10 focus-within:border-[#2DD4BF]/50')
                  }`}>
                    <Mail className="text-gray-300 mr-2 shrink-0" size={18} />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      disabled={!!urlEmail || isSubmitting}
                      placeholder="seu-email@dominio.com"
                      value={inputEmail}
                      onChange={(e) => {
                        setInputEmail(e.target.value);
                        setEmailTouched(true);
                      }}
                      onBlur={() => setEmailTouched(true)}
                      className={`bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono disabled:text-gray-400 ${urlEmail ? 'cursor-not-allowed' : ''}`}
                    />
                  </div>
                  {!urlEmail && emailTouched && getEmailError() && (
                    <p className="text-xs text-rose-400 font-mono mt-1 text-left pl-1">
                      • {getEmailError()}
                    </p>
                  )}
                </div>

                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                    Nova Senha
                  </label>
                  <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 transition-all min-h-[48px] ${
                    passwordTouched && getPasswordError() 
                      ? 'border-rose-500/50 focus-within:border-rose-500/70' 
                      : 'border-white/10 focus-within:border-[#2DD4BF]/50'
                  }`}>
                    <Lock className="text-gray-300 mr-2 shrink-0" size={18} />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      placeholder="Nova senha (mín. 4 dgt)"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordTouched(true);
                      }}
                      onBlur={() => setPasswordTouched(true)}
                      className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="text-gray-300 hover:text-white transition cursor-pointer shrink-0 p-2.5 -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px] disabled:opacity-50"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordTouched && getPasswordError() && (
                    <p className="text-xs text-rose-400 font-mono mt-1 text-left pl-1">
                      • {getPasswordError()}
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-gray-200 text-xs font-bold tracking-widest uppercase block">
                    Confirmar Nova Senha
                  </label>
                  <div className={`flex items-center bg-white/5 border rounded-2xl px-4 py-3.5 transition-all min-h-[48px] ${
                    confirmTouched && getConfirmPasswordError() 
                      ? 'border-rose-500/50 focus-within:border-rose-500/70' 
                      : 'border-white/10 focus-within:border-[#2DD4BF]/50'
                  }`}>
                    <Lock className="text-gray-300 mr-2 shrink-0" size={18} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      placeholder="Confirme sua senha"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmTouched(true);
                      }}
                      onBlur={() => setConfirmTouched(true)}
                      className="bg-transparent text-base w-full text-white border-0 outline-none focus:outline-none focus:ring-0 font-mono disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-gray-300 hover:text-white transition cursor-pointer shrink-0 p-2.5 -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px] disabled:opacity-50"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {confirmTouched && getConfirmPasswordError() && (
                    <p className="text-xs text-rose-400 font-mono mt-1 text-left pl-1">
                      • {getConfirmPasswordError()}
                    </p>
                  )}
                </div>

                {/* Reset Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 bg-[#2DD4BF] text-black py-4 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-[0_0_25px_rgba(45,212,191,0.25)] hover:shadow-[0_0_35px_rgba(45,212,191,0.45)] hover:scale-[1.02] transition active:scale-95 cursor-pointer flex items-center justify-center space-x-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/35 border-t-black rounded-full animate-spin mr-1" />
                      <span>Processando alteração...</span>
                    </>
                  ) : (
                    <>
                      <span>Salvar Nova Senha</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full text-center text-sm text-gray-300 hover:text-white transition underline decoration-dotted cursor-pointer py-3"
              >
                Cancelar e voltar ao Login
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
