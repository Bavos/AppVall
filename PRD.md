# PRD - Vall Task Manager
**Documento de Requisitos do Produto (Product Requirement Document)**

Este documento descreve a visão geral, objetivos estratégicos, arquitetura técnica, modelo de dados e especificações funcionais e não-funcionais do **Vall**, um sistema de gerenciamento operacional de tarefas minimalista, focado em alta produtividade e projetado para ambientes de colaboração profissional distribuída.

---

## 1. Visão Geral do Produto

O **Vall** é uma plataforma full-stack moderna voltada para a otimização de fluxos operacionais, agendamentos profissionais e acompanhamento de produtividade diária. Ele resolve o desafio comum enfrentado por administradores e membros de equipes operacionalmente intensivas que precisam sincronizar cronogramas, registrar logs diários, medir tempos de execução e obter resumos consolidados inteligentes automaticamente através de inteligência artificial.

### 1.1 Missão e Proposta de Valor
- **Produtividade Sem Ruído**: Interface minimalista com separação nítida de responsabilidades e categorias operacionais.
- **Sincronização Segura**: Integração bidirecional robusta com o Google Calendar e suporte nativo a videoconferências (Google Meet).
- **Inteligência Prática**: Geração automatizada de relatórios sintéticos de acompanhamento diário via Gemini AI, entregues diretamente no correio eletrônico dos coordenadores.

---

## 2. Perfis de Usuários (Papéis e Permissões)

O sistema opera sob dois níveis hierárquicos de acesso controlados via Firestore Security Rules:

### 2.1 Administrador (Admin)
- **Escopo**: Controle total do tenant de gerenciamento.
- **Permissões**:
  - Criar, delegar, editar e excluir tarefas operacionais de qualquer membro sob sua gestão.
  - Cadastrar, onboardar, resetar credenciais ou excluir perfis de membros.
  - Visualizar estatísticas agregadas de esforço, produtividade e foco de toda a equipe.
  - Configurar parâmetros de relatórios de IA automatizados.
  - Forçar o disparo manual de relatórios operacionais consolidados.

### 2.2 Membro (Member)
- **Escopo**: Foco na execução individual.
- **Permissões**:
  - Visualizar o cronograma diário pessoal recebido do seu Administrador correspondente.
  - Alterar o status de suas tarefas assigned (Pendente, Em Progresso, Concluída).
  - Registrar tempos reais gastos na execução das atividades.
  - Iniciar sessões de foco integradas com medidores pomodoro e registrar históricos de atenção.

---

## 3. Arquitetura do Sistema e Stack Tecnológico

A plataforma adota um modelo full-stack otimizado para escalabilidade horizontal em Cloud Run e integridade transacional offline-first híbrida:

```
┌────────────────────────────────────────────────────────┐
│                      CLIENT (SPA)                      │
│  React 18 + Vite + Tailwind CSS + Lucide Icons         │
│  Firebase Client SDK (Auth, Firestore, Sync)           │
│  Google API Authentication Client (OAuth G-Suite)      │
└───────────────────────────┬────────────────────────────┘
                            │
              REST API &    │ Firebase Live
           Relatórios (JSON)│ listeners
                            ▼
┌────────────────────────────────────────────────────────┐
│                      BACKEND API                       │
│  Express Server (Node.js engine)                       │
│  Firebase Admin SDK                                    │
│  Google GenAI SDK (Gemini AI integration)              │
│  Nodemailer (Secure SMTP Transporter)                  │
└────────────────────────────────────────────────────────┘
```

### 3.1 Tecnologias Utilizadas
- **Runtime**: Node.js & TypeScript
- **Front-End SPA**: React 18, Vite, Tailwind CSS, Lucide React (Ícones de interface).
- **Banco de Dados**: Google Firebase Firestore (Durable Cloud Persistence com suporte a sub-coleções específicas por tenant).
- **Autenticação**: Firebase Authentication integrada a credenciais G-Suite / Google Sign-In.
- **Sincronização de Calendário**: Integração direta com Google Calendar API (Criação de eventos, controle de RSVP e geração de links do Google Meet).
- **Mecanismo de IA**: `@google/genai` TypeScript SDK (utilizando modelos generativos Gemini para auto-categorização estruturada e diagnósticos operacionais).
- **Servidor de Correio**: Nodemailer para roteamento de relatórios via canais SMTP criptografados (SSL/TLS).

---

## 4. Requisitos Funcionais

O Vall fundamenta-se sobre quatro pilares funcionais principais:

### 4.1 Autenticação e Controle de Entrada
- **Mecanismos**: Suporta login federado via Google e fluxo clássico de e-mail e senha.
- **Fluxo de Recuperação**: Funcionalidade de redefinição de senha com envio automatizado de instruções diretamente da aplicação.
- **Onboarding Administrativo**: Admins podem pré-registrar membros da equipe, garantindo a associação automática de segurança ao mesmo escopo operacional corporativo.

### 4.2 O Motor de Tarefas Multicategóricas (Multi-categorical Task Engine)
Cada tarefa emite um modelo de dados refinado integrado à agenda do usuário, suportando quatro categorias funcionais cruciais:

1. **Agendamento**:
   - Atividades clássicas com horário fixo (`HH:MM`), linkadas opcionalmente à geração automática de reuniões virtuais Google Meet e envio automático de convites no e-mail do paciente/cliente registrado.
2. **Curinga**:
   - Atividades flexíveis pendentes de alocação imediata, ideal para pacientes "standby" ou demandas emergenciais sob demanda de prioridade variável.
3. **Disponível**:
   - Registro estruturado das faixas horárias de atuação e janelas de atendimento das profissionais da clínica ou consultório.
4. **Notas**:
   - Registros de ocorrência, anotações rápidas e feedbacks clínicos consolidados no histórico diário de execução.

### 4.3 Produtividade, Foco e Sessões Pomodoro
- **Focus Timer**: Cronômetro de execução integrado a cada tarefa. Permite que o membro da equipe ligue a contagem regressiva dedicada enquanto estiver focado.
- **Métricas de Fechamento**: Registro automatizado da relação `Tempo Estimado vs. Tempo Real Executado` (`estimatedMinutes` vs `actualMinutes`), permitindo ao gestor avaliar e calibrar o esforço de cada colaborador no painel de estatísticas.

### 4.4 Gerador de Relatórios Diários Inteligentes (Gemini + SMTP Engine)
- **Geração por Demanda**: No painel de gerenciamento, o administrador escolhe um e-mail de destino e aciona o relatório operacional de qualquer data. O sistema reúne as tarefas e anotações, processa-as em linguagem natural através da IA do Gemini e formata uma síntese executiva.
- **Execução Background Autônoma (Client-Driven Sync)**: Para evitar bloqueios severos de conexão das regras de segurança de contas de serviços internas do Google Cloud em áreas isoladas da visualização web, os navegadores dos administradores ativos monitoram a virada de data automaticamente. Ao detectar um novo período que requer fechamento diário, o client extrai o lote de dados autoritativamente e aciona a API de envio em background de forma segura e imediata.
- **Entrega SMTP Robustecida**: O motor suporta chaves e credenciais contendo caracteres especiais com tratamento especial de codificação que previne falhas de autolimitação e falha de login (Erro 535) nas conexões de servidores de correio padrão Corporativos e Gmail App Passwords.

---

## 5. Especificações de Dados (Modelo Firestore)

As coleções estão esquematizadas de forma a isolar dados administrativos de acessos transversais:

### 5.1 Coleção: `user_profiles`
Cada perfil reside no documento correspondente ao e-mail lowercase do usuário.

```json
{
  "email": "membro@empresa.com",
  "name": "Nome do Colaborador",
  "role": "member", // ou 'admin'
  "adminEmail": "administrador@empresa.com",
  "createdAt": "2026-06-09T02:00:00Z",
  "dailyReportConfig": {
    "enabled": true,
    "email": "supervisor@empresa.com",
    "lastSentDate": "2026-06-08"
  }
}
```

### 5.2 Coleção: `tasks`
Gerencia todo o repositório de atividades de forma atomizada para fácil pesquisa indexada:

```json
{
  "id": "uuid-da-tarefa-gerada",
  "title": "Sessão Operacional A",
  "description": "Detalhamento clínico preliminar",
  "date": "2026-06-09",
  "time": "14:30",
  "category": "Agendamento",
  "priority": "Alta",
  "status": "Em Progresso",
  "estimatedMinutes": 60,
  "actualMinutes": 45,
  "createdAt": "2026-06-09T10:00:00.000Z",
  "userEmail": "membro@empresa.com",
  "adminEmail": "administrador@empresa.com",
  "googleEventId": "cal-event-id",
  "googleEventLink": "https://calendar.google.com/...",
  "googleMeetLink": "https://meet.google.com/..."
}
```

---

## 6. Requisitos Não-Funcionais

### 6.1 Desempenho e Latência
- **Carregamento Instantâneo**: Todo o roteiro visual da interface SPA é otimizado para inicializar em menos de 1.5 segundos.
- **Sincronização em Tempo Real**: Através de `onSnapshot` do Firestore, as tarefas atribuídas pelo Admin no painel de agendamento são propagadas simultaneamente à tela operacional do Membro em menos de 500ms.

### 6.2 Segurança e Privacidade de Dados
- **Rules de Segurança**: Nenhuma tarefa pode ser lida ou escrita por e-mails de terceiros que não coincidam com os campos `adminEmail` ou `userEmail` associados.
- **Segurança de Credenciais**: Senhas administrativas e segredos do sistema (`SMT_PASS`, `GEMINI_API_KEY`) nunca são expostos à camada de visualização Web (Client-side), sendo consumidos estritamente no ecossistema Express Server via proxy seguro de APIs (`/api/*`).

### 6.3 Confiabilidade & Modo de Falha
- **Mecanismos de Fallback**: Caso ocorra desconexão com o banco Firestore no momento crítico de fechamento de relatório, o motor de fallback recupera os históricos imediatamente do `localStorage` criptografado (Vall cache), garantindo que nenhum relatório corporativo diário de faturamento/esforço operacional seja desperdiçado por flutuações de rede de internet local.

---

## 7. Critérios de Aceite Operacionais

1. O Administrador deve conseguir registrar um Membro, logar com sucesso, gerar uma tarefa do tipo "Agendamento" de forma visual, e ver o convite com link Meet gerado se integrar com sucesso no calendário.
2. O Membro deve abrir o painel, ver as atividades ordenadas por horário, dar início ao foco contador integrado e ver os minutos reais se salvarem ao concluir a tarefa.
3. Na janela administrativa de Gerenciamento, as credenciais e endereços informados na caixa Daily Report devem ser válidos, gerando previews em tempo real através da Gemini AI e resultando em relatórios impecavelmente embalados e distribuídos às caixas postais desejadas.
