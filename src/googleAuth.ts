import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

/**
 * Removes undefined keys from an object to prevent Firestore "Unsupported field value: undefined" errors
 * and prevent security rules violations by ensuring missing optional keys are completely absent.
 */
export function cleanUndefined<T extends object>(obj: T): T {
  const clean: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined && val !== null) {
        clean[key] = val;
      }
    }
  }
  return clean as T;
}

// Operational Error Logging for Firestore Security Audit
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/calendar.events');

let isSigningIn = false;
let cachedAccessToken: string | null = localStorage.getItem('vall_google_token');

// Load cached token from memory or attempt to recover
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Prime cached token from localStorage if available
  if (!cachedAccessToken) {
    cachedAccessToken = localStorage.getItem('vall_google_token');
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        cachedAccessToken = localStorage.getItem('vall_google_token');
      }
      
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      // If Firebase user is signed out, clear cache
      cachedAccessToken = null;
      localStorage.removeItem('vall_google_token');
      localStorage.removeItem('vall_google_email');
      localStorage.removeItem('vall_google_name');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter o token de acesso do Google.');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('vall_google_token', cachedAccessToken);
    
    if (result.user.email) {
      localStorage.setItem('vall_google_email', result.user.email);
    }
    if (result.user.displayName) {
      localStorage.setItem('vall_google_name', result.user.displayName);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Erro na autenticação do Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async () => {
  try {
    await auth.signOut();
  } catch (e) {
    console.warn('Firebase signOut non-blocking warning:', e);
  }
  cachedAccessToken = null;
  localStorage.removeItem('vall_google_token');
  localStorage.removeItem('vall_google_email');
  localStorage.removeItem('vall_google_name');
};

export const getAccessToken = (): string | null => {
  if (!cachedAccessToken) {
    cachedAccessToken = localStorage.getItem('vall_google_token');
  }
  return cachedAccessToken;
};

// Helper to calculate the next day for All-Day Events
export const getNextDayString = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to calculate ending date/time based on start date, start time, and duration
export const getEndDateTimeString = (dateStr: string, timeStr: string, durationMinutes: number = 60): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const dateObj = new Date(year, month - 1, day, hour, minute);
  dateObj.setMinutes(dateObj.getMinutes() + durationMinutes);
  
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const h = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  
  return `${y}-${m}-${d}T${h}:${min}:00`;
};

// Create an event on the user's primary Google Calendar with Meet and RSVP
export const createGoogleCalendarEvent = async (
  token: string,
  eventData: {
    title: string;
    description?: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM
    category: string;
    priority: string;
    estimatedMinutes?: number;
    email?: string; // Target email to receive RSVP invite
  }
): Promise<{ id: string; htmlLink: string; hangoutLink?: string } | null> => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    
    let start, end;
    if (eventData.time) {
      const startTimeStr = `${eventData.date}T${eventData.time}:00`;
      const endTimeStr = getEndDateTimeString(eventData.date, eventData.time, eventData.estimatedMinutes || 60);
      start = {
        dateTime: startTimeStr,
        timeZone
      };
      end = {
        dateTime: endTimeStr,
        timeZone
      };
    } else {
      const nextDay = getNextDayString(eventData.date);
      start = {
        date: eventData.date
      };
      end = {
        date: nextDay
      };
    }
    
    // Setup attendees if email is provided
    const attendees = eventData.email ? [{ email: eventData.email }] : [];

    // Create a random unique request ID for generating Google Meet
    const requestId = `vall_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const body: any = {
      summary: `${eventData.title} [VALL]`,
      description: `${eventData.description || 'Nenhuma descrição fornecida.'}\n\n---\nCategoria: ${eventData.category}\nPrioridade: ${eventData.priority}\nCriado via Sistema de Gestão VALL`,
      start,
      end,
      reminders: {
        useDefault: true
      },
      attendees,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    };

    // Append query params to trigger sendUpdates and generate Google Meet conference
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401) {
        cachedAccessToken = null;
        localStorage.removeItem('vall_google_token');
        localStorage.removeItem('vall_google_email');
        localStorage.removeItem('vall_google_name');
        try {
          auth.signOut();
        } catch (_) {}
      }
      throw new Error(`Google Calendar API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      htmlLink: data.htmlLink,
      hangoutLink: data.hangoutLink
    };
  } catch (error) {
    console.error('Falha ao criar evento no Google Calendar:', error);
    throw error;
  }
};

// Check RSVP and Meet status for an event
export const getGoogleCalendarEventRSVP = async (
  token: string,
  eventId: string,
  attendeeEmail: string
): Promise<{ rsvpStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction' | undefined; hangoutLink?: string } | null> => {
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401) {
        cachedAccessToken = null;
        localStorage.removeItem('vall_google_token');
        localStorage.removeItem('vall_google_email');
        localStorage.removeItem('vall_google_name');
        try {
          auth.signOut();
        } catch (_) {}
      }
      console.warn(`Could not fetch RSVP for event ${eventId}: ${response.status} - ${errText}`);
      return null;
    }

    const data = await response.json();
    const attendees = data.attendees || [];
    const attendee = attendees.find((a: any) => a.email?.toLowerCase() === attendeeEmail.toLowerCase());
    
    let rsvpStatus = attendee ? attendee.responseStatus : undefined;
    
    // Tratativa inteligente: se o email do convidado for o do próprio organizador (dono da agenda / self),
    // consideramos o RSVP como aceito ('accepted') por padrão, já que o evento já se encontra em sua agenda.
    if (!rsvpStatus && (data.organizer?.self || data.organizer?.email?.toLowerCase() === attendeeEmail.toLowerCase())) {
      rsvpStatus = 'accepted';
    }

    return {
      rsvpStatus,
      hangoutLink: data.hangoutLink
    };
  } catch (error) {
    console.error('Erro ao verificar RSVP no Google Agenda:', error);
    return null;
  }
};

// Delete an event from the user's primary Google Calendar
export const deleteGoogleCalendarEvent = async (
  token: string,
  eventId: string
): Promise<boolean> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401) {
        cachedAccessToken = null;
        localStorage.removeItem('vall_google_token');
        localStorage.removeItem('vall_google_email');
        localStorage.removeItem('vall_google_name');
        try {
          auth.signOut();
        } catch (_) {}
      }
      console.warn(`Could not delete Google Calendar event ${eventId}: ${response.status} - ${errText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao remover evento no Google Agenda:', error);
    return false;
  }
};

