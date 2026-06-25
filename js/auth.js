async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUp(email, password, fullName, departmentSlug) {
  const { data: authData, error: authError } = await db.auth.signUp({ email, password });
  if (authError) throw authError;

  const { data: dept } = await db
    .from('departments')
    .select('id')
    .eq('slug', departmentSlug)
    .single();

  if (dept && authData.user) {
    await db.from('personnel').insert({
      auth_id: authData.user.id,
      department_id: dept.id,
      full_name: fullName,
      email: email,
      role: 'personel'
    });
  }

  return authData;
}

async function signOut() {
  await db.auth.signOut();
  showScreen('login');
}

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getCurrentPersonnel() {
  const session = await getSession();
  if (!session) return null;

  const { data } = await db
    .from('personnel')
    .select('*, departments(*)')
    .eq('auth_id', session.user.id)
    .single();

  return data;
}
