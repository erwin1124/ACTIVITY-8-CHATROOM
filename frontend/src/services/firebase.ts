// firebase.ts removed - project no longer uses Firebase
// Keep stubs so existing imports don't break immediately.
export async function getIdToken() {
  // Frontend will use backend JWT stored in localStorage under 'token'
  return localStorage.getItem('token');
}

export async function signOut() {
  localStorage.removeItem('token');
}

export async function signInWithEmail(_email: string, _password: string) {
  throw new Error('Use backend /auth/login instead.');
}

export async function signUpWithEmail(_email: string, _password: string) {
  throw new Error('Use backend /auth/signup instead.');
}

export default {};
