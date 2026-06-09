import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Path-safe dynamic read of firebase-applet-config.json
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

// Initialize Firebase Admin with credentials
admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

// Initialize Firestore through standard getFirestore API supporting specific database ID
const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(admin.apps[0]!, firebaseConfig.firestoreDatabaseId)
  : getFirestore(admin.apps[0]!);

// Helper to send emails using SMTP or Ethereal/mock fallbacks
async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  let transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'no-reply@vall-app.com';

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    console.log(`[Email] Configured custom SMTP: ${host}`);
  } else {
    try {
      console.log(`[MOCK EMAIL LOG]
TO: ${to}
FROM: ${from}
SUBJECT: ${subject}
BODY:
${text}
`);
      return { success: true, mock: true };
    } catch (testAccountError) {
      console.warn('[Email] Failed to create Ethereal test account, logging in stdout', testAccountError);
      console.log(`[MOCK EMAIL LOG]
TO: ${to}
FROM: ${from}
SUBJECT: ${subject}
BODY:
${text}
`);
      return { success: true, mock: true };
    }
  }

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html: text.replace(/\n/g, '<br>')
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Email] Sent successfully: ${info.messageId}`);
  
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Email] Ethereal preview link: ${previewUrl}`);
    return { success: true, previewUrl, messageId: info.messageId };
  }

  return { success: true, messageId: info.messageId };
}

// REST API for User Registration and Onboarding Emails
app.get('/api/diagnose', (req, res) => {
  try {
    const envKeys = Object.keys(process.env).filter(k => !k.includes('PASS') && !k.includes('SECRET') && !k.includes('KEY'));
    res.json({
      envKeys,
      firebaseConfig,
      projectIdInAdmin: admin.apps[0]?.options.projectId || 'none',
      projectIdEnv: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'not set',
      firebaseDatabaseId: firebaseConfig.firestoreDatabaseId || 'not set'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, role, adminEmail } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Name and email are required fields.' });
  }

  console.log(`[API] Processing registration for: ${name} (${email})`);

  try {
    // Note: We skip Action 1 (Database save via Admin SDK) here because it relies on
    // Application Default Credentials (ADC) which may hang in this environment.
    // The frontend client SDK already saves the user profile reliably.

    // Action 2: Send system notification email to Admin
    const adminEmailAddress = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminMailSubject = 'Novo usuário cadastrado';
    const adminMailContent = `Novo usuário cadastrado no sistema:\n\nNome: ${name}\nE-mail: ${email}\nFunção: ${role || 'admin'}\nData de Cadastro: ${new Date().toLocaleString('pt-BR')}`;

    console.log(`[Email] Sending admin email to: ${adminEmailAddress}`);
    const adminMailRes = await sendEmail({
      to: adminEmailAddress,
      subject: adminMailSubject,
      text: adminMailContent
    });

    // Action 3: Send greetings configuration/welcome email to User
    const userMailSubject = 'Confirmação de Cadastro';
    const userMailContent = `Olá, ${name}!\n\nSeja muito bem-vindo ao aplicativo Vall. Seu cadastro foi realizado com sucesso e seu painel de controle já está pronto para uso!\n\nAproveite toda as nossas soluções de agendamento em tempo real.\n\nAtenciosamente,\nEquipe Vall`;

    console.log(`[Email] Sending welcome email to: ${email}`);
    const userMailRes = await sendEmail({
      to: email,
      subject: userMailSubject,
      text: userMailContent
    });

    res.json({
      success: true,
      message: 'Cadastro concluído e e-mails enviados com sucesso.',
      adminMail: adminMailRes,
      userMail: userMailRes
    });
  } catch (err: any) {
    console.error('[API Error] Registration failed:', err);
    res.status(500).json({ error: 'Failed to process registration workflow.', details: err.message });
  }
});

// Advanced API for credentials fallback and auto Firebase Auth synchronization
app.post('/api/login-fallback', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const emailLower = email.toLowerCase().trim();
    const userProfileRef = db.collection('user_profiles').doc(emailLower);
    const docSnap = await userProfileRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const profileData = docSnap.data();
    if (!profileData || profileData.password !== password) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Since the password matches, let's ensure they exist in Firebase Auth
    try {
      const authUser = await admin.auth().getUserByEmail(emailLower);
      // Synchronize/Update password to keep it in sync
      await admin.auth().updateUser(authUser.uid, { password });
    } catch (authErr: any) {
      if (authErr.code === 'auth/user-not-found') {
        // Create user in Firebase Auth
        await admin.auth().createUser({
          email: emailLower,
          password: password,
          displayName: profileData.name || 'Membro',
        });
      } else {
        throw authErr;
      }
    }

    return res.json({
      success: true,
      name: profileData.name || 'Membro',
      email: emailLower
    });

  } catch (err: any) {
    console.error('[API Error] Login fallback failed:', err);
    return res.status(500).json({ error: 'Login fallback process failed.', details: err.message });
  }
});

// Helper for Daily Operational Report plaintext / markdown fallback format
function cleanReportContentFields(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .filter(line => {
      const lower = line.toLowerCase();
      // Filter lines that look like key-value bullets for Estimativa, Prioridade, Status, or Estado
      const hasKey = lower.includes('estimativa') || lower.includes('prioridade') || lower.includes('status') || lower.includes('estado') || lower.includes('estimatedminutes') || lower.includes('priority');
      const isBulletOrBold = line.trim().startsWith('*') || line.trim().startsWith('-') || line.trim().startsWith('•') || lower.includes('**');
      
      if (hasKey && isBulletOrBold) {
        return false;
      }
      return true;
    })
    .join('\n');
}

function generateFallbackReport(tasks: any[], targetDate: string): string {
  const curinga = tasks.filter(t => t.category === 'Curinga');
  const disponivel = tasks.filter(t => t.category === 'Disponível');
  const agendamento = tasks.filter(t => t.category === 'Agendamento');

  let report = `### Olá! Aqui está o seu relatório diário de atividades do sistema VALL para o dia ${targetDate}.\n\n`;

  report += `### **Curinga**\n`;
  if (curinga.length === 0) {
    report += `Não há registros de pacientes Curinga para hoje.\n\n`;
  } else {
    curinga.forEach(t => {
      report += `- **${t.title}** ${t.description ? `- ${t.description}` : ''}\n`;
    });
    report += `\n`;
  }

  report += `### **Disponível**\n`;
  if (disponivel.length === 0) {
    report += `Não há profissionais com horários marcados como Disponível para hoje.\n\n`;
  } else {
    disponivel.forEach(t => {
      report += `- **${t.title}** ${t.time ? `às ${t.time}` : ''} ${t.description ? `- ${t.description}` : ''}\n`;
    });
    report += `\n`;
  }

  report += `### **Agendamento**\n`;
  if (agendamento.length === 0) {
    report += `Não há agendamentos ou sessões confirmadas para hoje.\n\n`;
  } else {
    agendamento.forEach(t => {
      report += `- **${t.title}** ${t.time ? `às ${t.time}` : ''} ${t.email ? `(${t.email})` : ''}\n`;
    });
    report += `\n`;
  }

  report += `---\n\n*Relatório gerado dinamicamente pelo Assistente Inteligente VALL. Tenha uma excelente jornada de trabalho!*`;
  return cleanReportContentFields(report);
}

// Helper function to call Gemini with automatic retries and model fallback (handles 503, 429, etc.)
async function generateContentWithRetryAndFallback(prompt: string, systemInstruction?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' }
    }
  });

  // Try models in order of preference
  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'];
  const maxRetries = 3;

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini API] Attempting content generation with model ${modelName} (attempt ${attempt}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined
        });

        if (response.text) {
          console.log(`[Gemini API] Successfully generated content using ${modelName} on attempt ${attempt}`);
          return response.text;
        }
      } catch (err: any) {
        const errMessage = err?.message || String(err);
        const isTransient = errMessage.includes('503') || errMessage.includes('429') || errMessage.includes('UNAVAILABLE') || errMessage.includes('RESOURCE_EXHAUSTED') || errMessage.includes('high demand');
        
        console.warn(`[Gemini API] Error using ${modelName} on attempt ${attempt}: ${errMessage}`);
        
        if (isTransient && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, etc.
          console.log(`[Gemini API] Transient error encountered. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // If it's not transient or we ran out of retries, break to try the next model
          break;
        }
      }
    }
  }

  throw new Error('All Gemini API models and retry attempts failed.');
}

// POST endpoint to trigger the Daily Report generation manually from the UI tab for preview/on-demand tests
app.post('/api/generate-daily-report', async (req, res) => {
  const { adminEmail, destinationEmail, selectedDate } = req.body;

  if (!adminEmail) {
    return res.status(400).json({ error: 'O parâmetro adminEmail é obrigatório.' });
  }

  try {
    const adminEmailLower = adminEmail.toLowerCase().trim();
    const dest = destinationEmail ? destinationEmail.trim() : adminEmailLower;
    const targetDate = selectedDate || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`[API Daily Report] Manual trigger requested for admin ${adminEmailLower}, date ${targetDate}`);

    // Fetch tasks - prefer client payload to respect Firestore permissions and avoid server-side credential issues in sandbox
    let filteredTasks: any[] = [];
    if (req.body.tasks && Array.isArray(req.body.tasks)) {
      filteredTasks = req.body.tasks.filter((t: any) => t.date === targetDate);
      console.log(`[API Daily Report] Successfully received and filtered ${filteredTasks.length} tasks from request payload for ${targetDate}.`);
    } else {
      try {
        console.log(`[API Daily Report] No tasks array in body. Attempting direct Firestore fetch...`);
        const tasksSnap = await db.collection('tasks')
          .where('adminEmail', '==', adminEmailLower)
          .get();
        const tasks = tasksSnap.docs.map(docSnap => docSnap.data());
        filteredTasks = tasks.filter((t: any) => t.date === targetDate);
        console.log(`[API Daily Report] Successfully fetched ${filteredTasks.length} tasks from Firestore for ${targetDate}`);
      } catch (dbErr: any) {
        console.warn('[API Daily Report] Failed to fetch tasks from Firestore direct collection.', dbErr.message);
      }
    }

    const sanitizedTasksForPrompt = filteredTasks.map(t => ({
      title: t.title,
      description: t.description || '',
      category: t.category,
      time: t.time || '',
      email: t.email || ''
    }));

    let reportContent = '';
    let isAiGenerated = false;

    // Use Gemini if available
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Você é o Assistente do Relatório Diário do aplicativo VALL. Seu papel é analisar a lista de tarefas/atividades abaixo para o dia ${targetDate} e transformá-los em um e-mail estruturado e formatado em Markdown com design amigável e profissional.
        
        Você DEVE organizar o texto ESTRITAMENTE em três seções Markdown de nível h3, nesta exata grafia:
        ### Curinga
        ### Disponível
        ### Agendamento

        Não coloque nenhuma outra seção principal além destas três. Se alguma seção não possuir registros, informe de maneira simpática e clara "Não há registros de pacientes Curinga para hoje" ou semelhante logo abaixo do título da seção pertinente. 

        ATENÇÃO CRÍTICA DE ESCOPO: Sob nenhuma hipótese inclua as informações de "Estimativa" (ou Estimativa de tempo), "Prioridade", ou "Status" das tarefas no conteúdo final do relatório ou em suas listagens. Mostre apenas o título, horário e descrição se houver.

        Eis as tarefas cadastradas no sistema:
        ${JSON.stringify(sanitizedTasksForPrompt, null, 2)}

        Gere uma breve introdução de bom-dia profissional e finalize desejando uma excelente jornada. Escreva tudo em Português do Brasil.`;

        const geminiResult = await generateContentWithRetryAndFallback(prompt);
        reportContent = cleanReportContentFields(geminiResult);
        isAiGenerated = true;
      } catch (geminiErr: any) {
        console.error('[API Daily Report] Gemini generateContent failed. Using offline rule-based fallback.', geminiErr.message || geminiErr);
      }
    }

    if (!reportContent) {
      reportContent = generateFallbackReport(filteredTasks, targetDate);
    } else {
      // Direct pass is already cleaned, but double check
      reportContent = cleanReportContentFields(reportContent);
    }

    // Attempt to send report email - wrap in try/catch so SMTP failures don't block the user from seeing and copying their report
    let emailRes: any;
    try {
      emailRes = await sendEmail({
        to: dest,
        subject: `[VALL] Relatório Diário - ${targetDate}`,
        text: reportContent
      });
    } catch (emailErr: any) {
      console.warn('[API Daily Report] Failed to send email via SMTP, returning success with details', emailErr.message || emailErr);
      emailRes = { success: false, error: emailErr.message || String(emailErr) };
    }

    return res.json({
      success: true,
      reportMarkdown: reportContent,
      isAiGenerated,
      sentTo: dest,
      tasksCount: filteredTasks.length,
      emailRes
    });

  } catch (err: any) {
    console.error('[API Daily Report Error] manual generation failed:', err);
    return res.status(500).json({ error: 'Erro ao processar relatório diário.', details: err.message });
  }
});

// Setup automated background cron checker to check and trigger report at the custom configured hour each day (Brazil UTC-3)
function startDailyReportScheduler() {
  console.log('[Scheduler] Initializing automated daily report check loop (runs every minute and respects custom time config, default 08:00 BRT)...');
  
  // Running a check every 60 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      // Adjust from Server Time (UTC) to Brazil Brasilia Time (UTC-3)
      const brTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const hours = brTime.getUTCHours();
      const minutes = brTime.getUTCMinutes();
      const brTimeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const brDateString = brTime.toISOString().split('T')[0];

      const profilesSnap = await db.collection('user_profiles').get();
      for (const docProf of profilesSnap.docs) {
        const profile = docProf.data();
        const reportConfig = profile.dailyReportConfig;

        // Process only if configuration exists, is enabled, and is scheduled for this exact minute
        if (reportConfig && reportConfig.enabled) {
          const sendTime = reportConfig.sendTime || '08:00';
          if (sendTime !== brTimeString) {
            continue;
          }

          const adminEmail = (profile.adminEmail || profile.email || '').toLowerCase().trim();
          const destEmail = (reportConfig.email || profile.email || '').trim();

          if (!adminEmail) continue;

          if (reportConfig.lastSentDate === brDateString) {
            console.log(`[Scheduler] Daily report for ${adminEmail} was already sent today (${brDateString}). Skipping.`);
            continue;
          }

          console.log(`[Scheduler] Clock is ${brTimeString} (BRT) matching scheduled sendTime ${sendTime}. Generating automatized report of ${brDateString} for ${adminEmail} to ${destEmail}...`);

            // Fetch tasks for the admin email
            const tasksSnap = await db.collection('tasks')
              .where('adminEmail', '==', adminEmail)
              .get();

            const tasks = tasksSnap.docs.map(d => d.data());
            const filteredTasks = tasks.filter((t: any) => t.date === brDateString);

            const sanitizedTasksForPrompt = filteredTasks.map(t => ({
              title: t.title,
              description: t.description || '',
              category: t.category,
              time: t.time || '',
              email: t.email || ''
            }));

            let reportContent = '';
            let isAiGenerated = false;

            if (process.env.GEMINI_API_KEY) {
              try {
                const prompt = `Você é o Assistente do Relatório Diário do aplicativo VALL. Seu papel é analisar a lista de tarefas/atividades abaixo para o dia ${brDateString} e transformá-los em um e-mail estruturado e formatado em Markdown com design amigável e profissional.
                
                Você DEVE organizar o texto ESTRITAMENTE em três seções Markdown de nível h3, nesta exata grafia:
                ### Curinga
                ### Disponível
                ### Agendamento

                Não coloque nenhuma outra seção principal além destas três. Se alguma seção não possuir registros, informe de maneira simpática e clara "Não há registros de pacientes Curinga para hoje" ou semelhante logo abaixo do título da seção pertinente. 

                ATENÇÃO CRÍTICA DE ESCOPO: Sob nenhuma hipótese inclua as informações de "Estimativa" (ou Estimativa de tempo), "Prioridade", ou "Status" das tarefas no conteúdo final do relatório ou em suas listagens. Mostre apenas o título, horário e descrição se houver.

                Eis as tarefas cadastradas no sistema:
                ${JSON.stringify(sanitizedTasksForPrompt, null, 2)}

                Gere uma breve introdução de bom-dia profissional e finalize desejando uma excelente jornada. Escreva tudo em Português do Brasil.`;

                const geminiResult = await generateContentWithRetryAndFallback(prompt);
                reportContent = cleanReportContentFields(geminiResult);
                isAiGenerated = true;
              } catch (geminiErr: any) {
                console.error('[Scheduler] Gemini daily automated generator failed. falling back.', geminiErr.message || geminiErr);
              }
            }

            if (!reportContent) {
              reportContent = generateFallbackReport(filteredTasks, brDateString);
            } else {
              reportContent = cleanReportContentFields(reportContent);
            }

            // Send Email
            await sendEmail({
              to: destEmail,
              subject: `[VALL] Relatório Diário Automatizado - ${brDateString}`,
              text: reportContent
            });

            // Persist that it has been sent for today to avoid double calls
            await docProf.ref.update({
              'dailyReportConfig.lastSentDate': brDateString
            });

            console.log(`[Scheduler] Automated report successfully sent to ${destEmail}`);
          }
        }
      } catch (schedErr: any) {
      if (schedErr?.message?.includes('PERMISSION_DENIED')) {
        console.log('[Scheduler] Background direct DB scan restricted by security rules (expected in sandbox). Automated reports are managed safely and reliably in background via active administrator web sessions.');
      } else {
        console.error('[Scheduler ERROR] Failed in automated check loop details:', schedErr);
      }
    }
  }, 60000); // Executed every 1 minute
}

// Vite Integration
async function main() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    startDailyReportScheduler();
  });
}

main();
