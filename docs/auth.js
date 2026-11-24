import { FIREBASE_CONFIG } from './firebase-config.js';

async function loadFirebase() {
  const [app, auth] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js'),
  ]);
  return { ...auth, initializeApp: app.initializeApp };
}

export async function mountAuth(document, {
  config = FIREBASE_CONFIG,
  loadSdk = loadFirebase,
  loadWorkspace = () => import('./app.js'),
} = {}) {
  const $ = (id) => document.getElementById(id);
  const signIn = $('sign-in');
  const signOut = $('sign-out');
  const status = $('sign-in-status');
  const accountStatus = $('account-status');
  const avatar = $('account-avatar');
  const initials = $('account-initials');
  const workspace = ['study-skip-link', 'study-header', 'main', 'print-content'].map($);

  if (['apiKey', 'authDomain', 'projectId', 'appId'].some((key) => !config[key] || config[key].startsWith('YOUR_'))) {
    status.textContent = 'Google sign-in is not set up yet.';
    return;
  }

  try {
    const sdk = await loadSdk();
    const auth = sdk.getAuth(sdk.initializeApp(config));
    const provider = new sdk.GoogleAuthProvider();
    let uid;

    avatar.addEventListener('error', () => {
      avatar.hidden = true;
      initials.hidden = false;
    });
    signIn.addEventListener('click', async () => {
      signIn.disabled = true;
      status.textContent = 'Opening Google sign-in…';
      try {
        await sdk.signInWithPopup(auth, provider);
      } catch (error) {
        if (error.code === 'auth/popup-blocked') {
          status.textContent = 'Redirecting to Google…';
          try {
            await sdk.signInWithRedirect(auth, provider);
            return;
          } catch {
            status.textContent = 'Could not open Google sign-in. Try again.';
          }
        } else {
          status.textContent = error.code === 'auth/popup-closed-by-user'
            ? 'The Google sign-in window was closed. Try again when you’re ready.'
            : 'Could not sign in with Google. Try again.';
        }
        signIn.disabled = false;
      }
    });
    signOut.addEventListener('click', async () => {
      signOut.disabled = true;
      accountStatus.textContent = '';
      try {
        await sdk.signOut(auth);
      } catch {
        accountStatus.textContent = 'Could not sign out. Try again.';
        signOut.disabled = false;
      }
    });

    try {
      await sdk.getRedirectResult(auth);
      status.textContent = '';
    } catch {
      status.textContent = 'Could not finish Google sign-in. Try again.';
    }

    sdk.onAuthStateChanged(auth, async (user) => {
      const previousUid = uid;
      uid = user?.uid ?? null;
      if (previousUid && previousUid !== uid) {
        workspace.forEach((node) => { node.hidden = true; });
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        $('sign-in-screen').hidden = false;
        signIn.disabled = true;
        status.textContent = 'Checking your sign-in…';
        document.defaultView.location.reload();
        return;
      }
      if (!user) {
        signIn.disabled = false;
        return;
      }

      signIn.disabled = true;
      status.textContent = 'Loading your study workspace…';
      try {
        await loadWorkspace();
      } catch {
        status.textContent = 'Could not load Cramly. Reload the page to try again.';
        return;
      }
      if (uid !== user.uid) return;

      const name = user.displayName?.trim() || user.email || 'Google account';
      $('account-name').textContent = name;
      initials.textContent = Array.from(name)[0].toLocaleUpperCase();
      avatar.hidden = !user.photoURL;
      initials.hidden = !!user.photoURL;
      if (user.photoURL) avatar.src = user.photoURL;
      $('sign-in-screen').hidden = true;
      workspace.forEach((node) => { node.hidden = false; });
      if (previousUid === null) $('main').focus();
    });
  } catch {
    status.textContent = 'Google sign-in is unavailable. Reload the page to try again.';
  }
}
