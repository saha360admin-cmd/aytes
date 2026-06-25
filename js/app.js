let currentDepartment = null;
let currentPersonnel = null;

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.remove('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-lg py-sm rounded-full text-label-md font-label-md z-[100] transition-all duration-300 ${
    type === 'error' ? 'bg-error text-on-error' :
    type === 'success' ? 'bg-secondary text-on-secondary' :
    'bg-primary text-on-primary'
  }`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function selectDepartment(slug) {
  currentDepartment = slug;
  document.getElementById('dept-title').textContent = {
    idari: 'İdari İşler', guvenlik: 'Güvenlik', teknik: 'Teknik', temizlik: 'Temizlik'
  }[slug];
  showScreen('auth-screen');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Giriş yapılıyor...';

  try {
    await signIn(email, password);
    const personnel = await getCurrentPersonnel();
    if (personnel) {
      currentPersonnel = personnel;
      await loadDashboard();
    } else {
      showToast('Personel kaydı bulunamadı', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">login</span> Giriş Yap';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await signUp(email, password, fullName, currentDepartment);
    showToast('Kayıt başarılı! E-postanızı doğrulayın.', 'success');
    toggleAuthMode();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function toggleAuthMode() {
  document.getElementById('login-form').classList.toggle('hidden');
  document.getElementById('register-form').classList.toggle('hidden');
  document.getElementById('auth-toggle-text').innerHTML =
    document.getElementById('login-form').classList.contains('hidden')
      ? 'Zaten hesabınız var mı? <button onclick="toggleAuthMode()" class="text-primary font-semibold">Giriş Yap</button>'
      : 'Hesabınız yok mu? <button onclick="toggleAuthMode()" class="text-primary font-semibold">Kayıt Ol</button>';
}

async function loadDashboard() {
  showScreen('dashboard');
  const p = currentPersonnel;
  document.getElementById('dash-name').textContent = p.full_name;
  document.getElementById('dash-dept').textContent = p.departments?.name || '';
  document.getElementById('dash-role').textContent = {
    admin: 'Yönetici', supervisor: 'Süpervizör', personel: 'Personel'
  }[p.role];

  await Promise.all([loadStats(), loadTasks(), loadAnnouncements()]);
}

async function loadStats() {
  const deptId = currentPersonnel.department_id;

  const [personnelRes, tasksRes, attendanceRes] = await Promise.all([
    db.from('personnel').select('id', { count: 'exact', head: true }).eq('department_id', deptId),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'pending'),
    db.from('attendance').select('id', { count: 'exact', head: true }).eq('date', new Date().toISOString().split('T')[0])
  ]);

  document.getElementById('stat-personnel').textContent = personnelRes.count || 0;
  document.getElementById('stat-tasks').textContent = tasksRes.count || 0;
  document.getElementById('stat-attendance').textContent = attendanceRes.count || 0;
}

async function loadTasks() {
  const { data: tasks } = await db
    .from('tasks')
    .select('*, assigned:assigned_to(full_name)')
    .eq('department_id', currentPersonnel.department_id)
    .order('created_at', { ascending: false })
    .limit(5);

  const container = document.getElementById('tasks-list');
  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<p class="text-on-surface-variant text-center py-lg">Henüz görev yok</p>';
    return;
  }

  container.innerHTML = tasks.map(t => `
    <div class="flex items-center gap-md p-md rounded-lg bg-surface-container-low">
      <div class="w-10 h-10 rounded-full flex items-center justify-center ${
        t.priority === 'urgent' ? 'bg-error-container' :
        t.priority === 'high' ? 'bg-tertiary-fixed' :
        'bg-primary-fixed'
      }">
        <span class="material-symbols-outlined text-[20px] ${
          t.priority === 'urgent' ? 'text-error' :
          t.priority === 'high' ? 'text-tertiary' :
          'text-primary'
        }">task_alt</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-label-md text-on-surface truncate">${t.title}</p>
        <p class="text-label-sm text-on-surface-variant">${t.assigned?.full_name || 'Atanmadı'}</p>
      </div>
      <span class="px-sm py-xs rounded-full text-label-sm ${
        t.status === 'completed' ? 'bg-secondary-fixed text-on-secondary-fixed' :
        t.status === 'in_progress' ? 'bg-tertiary-fixed text-on-tertiary-fixed' :
        'bg-primary-fixed text-on-primary-fixed'
      }">${{ pending: 'Bekliyor', in_progress: 'Devam', completed: 'Tamamlandı', cancelled: 'İptal' }[t.status]}</span>
    </div>
  `).join('');
}

async function loadAnnouncements() {
  const { data: announcements } = await db
    .from('announcements')
    .select('*, creator:created_by(full_name)')
    .eq('department_id', currentPersonnel.department_id)
    .order('created_at', { ascending: false })
    .limit(3);

  const container = document.getElementById('announcements-list');
  if (!announcements || announcements.length === 0) {
    container.innerHTML = '<p class="text-on-surface-variant text-center py-lg">Henüz duyuru yok</p>';
    return;
  }

  container.innerHTML = announcements.map(a => `
    <div class="p-md rounded-lg bg-surface-container-low space-y-xs">
      <div class="flex items-center justify-between">
        <p class="font-label-md text-on-surface">${a.title}</p>
        ${a.is_pinned ? '<span class="material-symbols-outlined text-tertiary text-[18px]" style="font-variation-settings: \'FILL\' 1;">push_pin</span>' : ''}
      </div>
      <p class="text-body-md text-on-surface-variant line-clamp-2">${a.content}</p>
      <p class="text-label-sm text-outline">${a.creator?.full_name || ''} · ${new Date(a.created_at).toLocaleDateString('tr-TR')}</p>
    </div>
  `).join('');
}

async function handleCheckIn() {
  try {
    await db.from('attendance').insert({
      personnel_id: currentPersonnel.id,
      check_in: new Date().toISOString(),
      status: 'present',
      date: new Date().toISOString().split('T')[0]
    });
    showToast('Giriş kaydedildi!', 'success');
    await loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function init() {
  const session = await getSession();
  if (session) {
    const personnel = await getCurrentPersonnel();
    if (personnel) {
      currentPersonnel = personnel;
      currentDepartment = personnel.departments?.slug;
      await loadDashboard();
      return;
    }
  }
  showScreen('login');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

document.addEventListener('DOMContentLoaded', init);
