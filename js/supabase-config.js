const SUPABASE_URL = 'https://rtglrsgedmoknaumonbr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bAkyeJpEyX4qjkrWwhRgkQ_Vd3_JE-M';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
