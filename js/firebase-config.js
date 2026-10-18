// Identificativi pubblici del progetto Firebase (non sono segreti: la sicurezza è nelle regole del database).
export const firebaseConfig = {
  apiKey: 'AIzaSyCsZck3PxAfFBwsuugb_Omp_UhhfAs8L4E',
  authDomain: 'pickleballgreece-955da.firebaseapp.com',
  projectId: 'pickleballgreece-955da',
  storageBucket: 'pickleballgreece-955da.firebasestorage.app',
  messagingSenderId: '1066755212579',
  appId: '1:1066755212579:web:6f9964d4bf73684995f896'
};

// Amministratori principali (UID; devono coincidere con firestore.rules). Altri amministratori: raccolta "admins",
// gestita dall'app (Amministrazione → Utenti).
export const mainAdminUids = [];
