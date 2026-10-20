import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Configurações padrão do projeto vota-iasd-central
// Permite migração instantânea apenas trocando o arquivo .env se desejado
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDpgZyFqlNPdP1NFQ6OpE_PhLtZoydkO5A',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'vota-iasd-central.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vota-iasd-central',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'vota-iasd-central.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '359677815162',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:359677815162:web:9406eaf58d6260de6f8ec3',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'SUA_API_KEY_AQUI'
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    console.log('✅ Firebase Firestore conectado com sucesso ao projeto:', firebaseConfig.projectId);
  } catch (error) {
    console.warn('⚠️ Erro ao inicializar Firebase, operando em modo de simulação local:', error);
  }
} else {
  console.log('ℹ️ Firebase não configurado no .env. Operando em modo de sincronização local (BroadcastChannel / LocalStorage).');
}

export { app, db };
