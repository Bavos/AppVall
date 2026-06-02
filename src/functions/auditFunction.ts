import { onDocumentWritten, FirestoreEvent } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// 1. Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

interface AuditPayload {
  organizationId: string;
  productId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  userId: string | null;
  userEmail: string | null;
  timestamp: FieldValue;
  changes: {
    before?: any;
    after?: any;
    modifiedKeys?: string[];
  };
}

/**
 * Enterprise Multi-Tenant Cloud Function (Gen 2)
 * Triggers on any document write inside "/organizations/{orgId}/produtos/{productId}"
 * Automatically parses execution metadata and saves a detailed log to global "/audit_logs"
 */
export const auditProductWrite = onDocumentWritten(
  {
    document: 'organizations/{orgId}/produtos/{productId}',
    region: 'us-central1', // Set your desired region
    cpu: 'gcf_gen1' // Adjust specs as needed
  },
  async (event: FirestoreEvent<any, { orgId: string; productId: string }>) => {
    const { orgId, productId } = event.params;
    const documentData = event.data;

    // Guard representing unexpected empty event data
    if (!documentData) {
      console.warn('Event skipped: No document snapshot available');
      return;
    }

    const beforeSnap = documentData.before;
    const afterSnap = documentData.after;

    const beforeData = beforeSnap.exists ? beforeSnap.data() : null;
    const afterData = afterSnap.exists ? afterSnap.data() : null;

    // Detect action type
    let action: 'CREATE' | 'UPDATE' | 'DELETE' = 'UPDATE';
    if (!beforeSnap.exists && afterSnap.exists) {
      action = 'CREATE';
    } else if (beforeSnap.exists && !afterSnap.exists) {
      action = 'DELETE';
    }

    // Trace client credentials executing the operation
    // Gen 2 Event context exposes "event.auth" for client-driven Firestore changes (such as write rules, etc.)
    const authId = event.auth ? event.auth.uid : null;
    const authEmail = event.auth && event.auth.token ? event.auth.token.email || null : null;

    // Calculate changes diff if the action is update
    const modifiedKeys: string[] = [];
    if (action === 'UPDATE' && beforeData && afterData) {
      const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
      for (const key of allKeys) {
        if (JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])) {
          modifiedKeys.push(key);
        }
      }
    }

    const auditLog: AuditPayload = {
      organizationId: orgId,
      productId: productId,
      action: action,
      userId: authId,
      userEmail: authEmail || 'sys-operator@firebase.internal',
      timestamp: FieldValue.serverTimestamp(),
      changes: {
        ...(beforeData && { before: beforeData }),
        ...(afterData && { after: afterData }),
        ...(modifiedKeys.length > 0 && { modifiedKeys }),
      }
    };

    try {
      // Save directly to global root collection `/audit_logs`
      const auditLogsRef = db.collection('audit_logs');
      const docRef = await auditLogsRef.add(auditLog);
      
      console.log(`[Audit Trigger Success] Saved audit record ${docRef.id} for project Organization: ${orgId}, Product: ${productId}, Action: ${action}`);
    } catch (err) {
      console.error(`[Audit Trigger Failure] Failed writing audit log for Organization ${orgId}:`, err);
      // Re-throwing allows GCP to catch the error and trace retry/execution policy
      throw err;
    }
  }
);
