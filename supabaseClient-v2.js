console.log("Supabase Client Loaded");

// 🔥 Mude para suas chaves verdadeiras
const SUPABASE_URL = "https://ujpbdoykjrntqketqjxa.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcGJkb3lranJudHFrZXRxanhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NTcxNDAsImV4cCI6MjA3OTAzMzE0MH0.kYstg_WVcsAANWWf942_qhrJLYyrPRR_gbN83kIqQxQ"; // sua anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Cliente criado:", supabase);
