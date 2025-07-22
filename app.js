import { firebaseConfig } from './firebaseConfig.js';

// --- Init
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const storage = firebase.storage();

// --- Persistent login
auth.onAuthStateChanged(async user=>{
  if(!user){ window.location = '/login.html'; return; }
  document.getElementById('app').style.display='block';
  document.getElementById('clientName').textContent = user.displayName || user.email;

  // Load case timeline
  db.collection('cases').where('clientUid','==',user.uid)
    .orderBy('updated','desc').onSnapshot(sn=>{
      const list=document.getElementById('caseTimeline'); list.innerHTML='';
      sn.forEach(doc=>{
        const d=doc.data();
        list.insertAdjacentHTML('beforeend',
          `<li class="list-group-item">${d.updated.toDate().toLocaleDateString()} – ${d.note}</li>`);
      });
    });

  // Load unpaid balance
  db.doc(`billing/${user.uid}`).onSnapshot(doc=>{
    document.getElementById('balance').textContent = doc.exists ? `$${doc.data().due}` : '$0.00';
    window.clientDue = doc.exists ? doc.data().dueCents : 0;
  });

  // Load docs
  loadDocs(user.uid);
});

// --- File upload
async function loadDocs(uid){
  const vault = document.getElementById('docList'); vault.innerHTML='';
  const files = await storage.ref(`vault/${uid}`).listAll();
  files.items.forEach(async ref=>{
    const url = await ref.getDownloadURL();
    vault.insertAdjacentHTML('beforeend',`
      <div class="col-12 col-md-4">
        <div class="card card-hover">
          <div class="card-body">
            <h6 class="card-title text-truncate">${ref.name}</h6>
            <a href="${url}" target="_blank" class="stretched-link">View</a>
          </div>
        </div>
      </div>`);
  });
}

document.getElementById('fileInput').addEventListener('change',async e=>{
  const file=e.target.files[0];
  if(!file) return;
  const uid=auth.currentUser.uid;
  await storage.ref(`vault/${uid}/${file.name}`).put(file);
  loadDocs(uid);
});

// --- Messaging
document.getElementById('msgForm').addEventListener('submit',e=>{
  e.preventDefault();
  const txt=document.getElementById('msgBox');
  db.collection('messages').add({
    uid:auth.currentUser.uid,
    body:txt.value,
    sent:firebase.firestore.FieldValue.serverTimestamp()
  });
  txt.value='';
});

// --- Stripe payment
const stripe=Stripe('pk_test_REPLACE');
document.getElementById('payBtn').addEventListener('click', async ()=>{
  if(!window.clientDue){alert('No balance due'); return;}
  const fn = firebase.functions(); // region default
  const createSession = fn.httpsCallable('createStripeSession');
  const { data } = await createSession({ cents: window.clientDue });
  await stripe.redirectToCheckout({ sessionId:data.id });
});

// --- Logout
document.getElementById('logoutBtn').onclick=()=>auth.signOut();
