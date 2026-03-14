import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDptCTrAafKF-yG0OVOO8UB4lCEVrsHKpo",
  authDomain: "expense-trucker-9c78e.firebaseapp.com",
  projectId: "expense-trucker-9c78e",
  storageBucket: "expense-trucker-9c78e.firebasestorage.app",
  messagingSenderId: "943821786931",
  appId: "1:943821786931:web:d331a1b89e3790c3c3b846"
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()