import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, runTransaction, DocumentSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../googleAuth';

interface Organization {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
}

interface MemberProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  joinedAt: Date;
}

interface TenantContextType {
  user: User | null;
  organizationId: string | null; // Backward compatibility with current components
  activeOrgId: string | null;    // Explicitly requested for Multi-Tenant
  organization: Organization | null;
  role: 'admin' | 'editor' | 'viewer' | null;
  loading: boolean;
  error: string | null;
  createOrganization: (orgName: string) => Promise<string>;
  logout: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Manages Auth State
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      if (!currentUser) {
        // Reset tenant state if logged out
        setOrganizationId(null);
        setOrganization(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-time Synchronization of User Org and Role
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Listen to User document containing active OrganizationId
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(
      userDocRef,
      (userSnap) => {
        if (!userSnap.exists()) {
          // If no user profile exists yet, user has no active tenancy
          setOrganizationId(null);
          setOrganization(null);
          setRole(null);
          setLoading(false);
          return;
        }

        const userData = userSnap.data();
        const orgId = userData?.organizationId || null;
        setOrganizationId(orgId);

        if (!orgId) {
          setOrganization(null);
          setRole(null);
          setLoading(false);
          return;
        }

        // Listen to Active Organization Meta
        const orgDocRef = doc(db, 'organizations', orgId);
        const unsubscribeOrg = onSnapshot(
          orgDocRef,
          (orgSnap) => {
            if (orgSnap.exists()) {
              setOrganization({
                id: orgSnap.id,
                ...orgSnap.data(),
              } as Organization);
            } else {
              setOrganization(null);
            }
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `organizations/${orgId}`);
          }
        );

        // Listen to User's Role within the Subcollection `/organizations/{orgId}/members/{uid}`
        const memberDocRef = doc(db, 'organizations', orgId, 'members', user.uid);
        const unsubscribeMember = onSnapshot(
          memberDocRef,
          (memberSnap) => {
            if (memberSnap.exists()) {
              const memberData = memberSnap.data();
              setRole(memberData?.role || null);
            } else {
              setRole(null);
            }
            setLoading(false);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `organizations/${orgId}/members/${user.uid}`);
            setLoading(false);
          }
        );

        return () => {
          unsubscribeOrg();
          unsubscribeMember();
        };
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribeUser();
  }, [user, authLoading]);

  // 3. Command to create a new Organization (creates Org, sets current user as Admin and links users/{uid})
  const createOrganization = async (orgName: string): Promise<string> => {
    if (!user) throw new Error('É necessário estar logado.');
    
    // Auto-generate organization ID
    const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const userDocRef = doc(db, 'users', user.uid);
    const orgDocRef = doc(db, 'organizations', orgId);
    const memberDocRef = doc(db, 'organizations', orgId, 'members', user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        // Set Organization document
        transaction.set(orgDocRef, {
          name: orgName,
          createdBy: user.uid,
          createdAt: new Date().toISOString()
        });

        // Add Member to subcollection
        transaction.set(memberDocRef, {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Membro',
          role: 'admin',
          joinedAt: new Date().toISOString()
        });

        // Update User profile with organization reference
        transaction.set(userDocRef, {
          organizationId: orgId,
          email: user.email || '',
          displayName: user.displayName || 'Usuário'
        }, { merge: true });
      });

      return orgId;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `organizations/${orgId}`);
      throw err;
    }
  };

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <TenantContext.Provider
      value={{
        user,
        organizationId,
        activeOrgId: organizationId,
        organization,
        role,
        loading: authLoading || loading,
        error,
        createOrganization,
        logout,
      }}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child);
        }
        return child;
      })}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant deve ser usado com um TenantProvider');
  }
  return context;
};
