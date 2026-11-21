import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AuthLanding } from './components/AuthLanding';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WalletOnboarding } from './components/WalletOnboarding';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import type {
  ContactDoc,
  PaymentRequestDoc,
  SecurityLogDoc,
  TransactionDoc,
  WalletDoc,
} from './types/wallet';

function WalletAppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [wallet, setWallet] = useState<WalletDoc | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);

  const [transactions, setTransactions] = useState<TransactionDoc[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactDoc[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogDoc[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestDoc[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setWallet(null);
        setWalletLoaded(false);
        setTransactions([]);
        setContacts([]);
        setSecurityLogs([]);
        setPaymentRequests([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Attach Firestore listeners only when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    setWalletLoaded(false);
    const walletPath = `wallets/${user.uid}`;
    const unsubWallet = onSnapshot(
      doc(db, 'wallets', user.uid),
      (snap) => {
        setWallet(snap.exists() ? (snap.data() as WalletDoc) : null);
        setWalletLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, walletPath);
      }
    );

    const txPath = 'transactions';
    setTransactionsLoading(true);
    const txQuery = query(
      collection(db, 'transactions'),
      where('participants', 'array-contains', user.uid),
      limit(100)
    );
    const unsubTx = onSnapshot(
      txQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as TransactionDoc);
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? Date.now();
          const tB = b.createdAt?.toMillis?.() ?? Date.now();
          return tB - tA;
        });
        setTransactions(list);
        setTransactionsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, txPath);
      }
    );

    const contactsPath = `wallets/${user.uid}/contacts`;
    const contactsQuery = query(
      collection(db, 'wallets', user.uid, 'contacts'),
      where('ownerUid', '==', user.uid)
    );
    const unsubContacts = onSnapshot(
      contactsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ContactDoc, 'id'>),
        }));
        list.sort((a, b) => a.nickname.localeCompare(b.nickname));
        setContacts(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, contactsPath);
      }
    );

    const logsPath = `wallets/${user.uid}/security_logs`;
    const logsQuery = query(
      collection(db, 'wallets', user.uid, 'security_logs'),
      where('ownerUid', '==', user.uid)
    );
    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SecurityLogDoc, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? Date.now();
          const tB = b.createdAt?.toMillis?.() ?? Date.now();
          return tB - tA;
        });
        setSecurityLogs(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, logsPath);
      }
    );

    const reqPath = 'payment_requests';
    const reqQuery = query(
      collection(db, 'payment_requests'),
      where('requesterUid', '==', user.uid)
    );
    const unsubReqs = onSnapshot(
      reqQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PaymentRequestDoc);
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? Date.now();
          const tB = b.createdAt?.toMillis?.() ?? Date.now();
          return tB - tA;
        });
        setPaymentRequests(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, reqPath);
      }
    );

    return () => {
      unsubWallet();
      unsubTx();
      unsubContacts();
      unsubLogs();
      unsubReqs();
    };
  }, [authReady, user]);

  const handleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!authReady || (user && !walletLoaded)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-10 w-full bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthLanding
        onSignIn={() => void handleSignIn()}
        isSigningIn={isSigningIn}
        authError={authError}
      />
    );
  }

  if (!wallet) {
    return <WalletOnboarding user={user} onSignOut={() => void handleSignOut()} />;
  }

  return (
    <DashboardWorkspace
      user={user}
      wallet={wallet}
      transactions={transactions}
      transactionsLoading={transactionsLoading}
      contacts={contacts}
      securityLogs={securityLogs}
      paymentRequests={paymentRequests}
      onSignOut={() => void handleSignOut()}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WalletAppContent />
    </ErrorBoundary>
  );
}
