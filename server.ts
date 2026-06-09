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
      auth: { user, pass },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000
    });
    console.log(`[Email] Configured custom SMTP: ${host} with 4000ms timeouts`);
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
      console.log('[Email] Failed to create Ethereal test account, logging in stdout', testAccountError);
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

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully: ${info.messageId}`);
    
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Email] Ethereal preview link: ${previewUrl}`);
      return { success: true, previewUrl, messageId: info.messageId };
    }

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.log(`[Email Info] SMTP send failed (user might have disabled, expired, or invalid credentials): ${err.message || err}`);
    return { success: false, error: err.message || String(err) };
  }
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



// Helper function to call Gemini with automatic retries and model fallback (handles 503, 429, etc.)
async function generateContentWithRetryAndFallback(prompt: string, systemInstruction?: string, maxRetries = 2): Promise<string> {
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

  // Try models in order of preference (using supported gemini-3.5-flash and gemini-3.1-flash-lite)
  const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

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
  });
}

main();
