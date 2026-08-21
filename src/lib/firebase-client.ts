import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

let isInitialized = false;

export async function initFirebaseClient() {
  if (isInitialized && getApps().length > 0) {
    const app = getApp();
    const auth = getAuth(app);
    return { auth, provider: new GoogleAuthProvider() };
  }

  try {
    // 直接使用新專案的設定，不需再透過 /api/firebase-config
    const firebaseConfig = {
      apiKey: "AIzaSyDKGrLuwgFDiZSbcxQcDCFCzFf-geyFjvE",
      authDomain: "csim-tmtm.firebaseapp.com",
      projectId: "csim-tmtm",
      storageBucket: "csim-tmtm.firebasestorage.app",
      messagingSenderId: "758952426843",
      appId: "1:758952426843:web:592b1d6cc66da8de8a6e7e"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    
    isInitialized = true;
    console.log("Client Firebase Auth initialized successfully");
    return { auth, provider };
  } catch (error) {
    console.error("Error initializing client Firebase Auth:", error);
    throw error;
  }
}
