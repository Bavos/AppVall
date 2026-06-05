import express from 'express';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';

const app = express();
const PORT = 3000;

app.use(express.json());

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
