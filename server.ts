import express from 'express';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';

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

// In-memory active notifications for connected users
interface ActiveNotification {
  id: string; // matches taskId
  email: string; // matches userEmail
  title: string;
  category: string;
  time?: string;
  date: string;
  task: any;
}

let activeNotifications: ActiveNotification[] = [];
let userTzOffsets: Record<string, number> = {};

// Background Worker: Checks all event scheduling alerts every minute
async function runBackgroundWorker() {
  try {
    console.log('[Worker] Checking pending event notifications in Firestore database...');
    const tasksRef = db.collection('tasks');
    
    // Fetch events (Agendamento is equivalent to Event in Vall system)
    const snapshot = await tasksRef
      .where('category', '==', 'Agendamento')
      .get();
      
    if (snapshot.empty) {
      return;
    }
    
    const nowEpoch = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    
    for (const doc of snapshot.docs) {
      const task = doc.data();
      
      // Skip if task meets completed or already notified criteria
      if (task.notificationSent === true || task.status === 'Concluída') {
        continue;
      }
      
      const leadTime = task.notificationLeadTime !== undefined ? Number(task.notificationLeadTime) : 15;
      
      if (!task.date || !task.time) {
        continue;
      }
      
      const userEmail = (task.userEmail || '').toLowerCase();
      // Get user timezoneOffset (defaults to America/Sao_Paulo (UTC-3), which is 180 minutes)
      const tzOffset = userTzOffsets[userEmail] !== undefined ? userTzOffsets[userEmail] : 180;
      
      // Parse task date (YYYY-MM-DD) and time (HH:MM)
      const [year, month, day] = task.date.split('-').map(Number);
      const [hour, min] = task.time.split(':').map(Number);
      
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(min)) {
        continue;
      }
      
      // Calculate trigger moment while handling the timezone correctly (UTC vs Local)
      const localAsUTC = Date.UTC(year, month - 1, day, hour, min, 0);
      const eventEpoch = localAsUTC + (tzOffset * 60 * 1000);
      const triggerEpoch = eventEpoch - (leadTime * 60 * 1000);
      
      // If we are past the trigger epoch but the event has not elapsed for more than 1 hour, trigger it!
      if (nowEpoch >= triggerEpoch && nowEpoch < eventEpoch + oneHourMs) {
        console.log(`[Worker] Event Alert Triggered: "${task.title}" for ${userEmail}`);
        
        const alreadyActive = activeNotifications.some(n => n.id === doc.id);
        if (!alreadyActive) {
          activeNotifications.push({
            id: doc.id,
            email: userEmail,
            title: task.title,
            category: task.category,
            time: task.time,
            date: task.date,
            task: task
          });
        }
        
        // Update database status immediately (persisting sent status to avoid dual triggers)
        await doc.ref.update({ notificationSent: true });
        console.log(`[Worker] Task ID ${doc.id} marked as notificationSent=true.`);
      }
    }
  } catch (error) {
    console.error('[Worker Error]', error);
  }
}

// Check every 60 seconds
setInterval(runBackgroundWorker, 60000);
// Trigger check after boot completes
setTimeout(runBackgroundWorker, 5000);

// API REST routes
app.get('/api/notifications', (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  const tzOffset = Number(req.query.tzOffset);
  
  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }
  
  if (!isNaN(tzOffset)) {
    userTzOffsets[email] = tzOffset;
  }
  
  const filtered = activeNotifications.filter(n => n.email === email);
  res.json({ notifications: filtered });
});

app.post('/api/notifications/dismiss', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing ID' });
  }
  activeNotifications = activeNotifications.filter(n => n.id !== id);
  res.json({ success: true });
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
