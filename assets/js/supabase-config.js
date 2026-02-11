// Supabase Configuration
// Requires CONFIG (from config.js) to be loaded first.
(function() {
'use strict';

const url = window.CONFIG?.supabase?.url;
const anonKey = window.CONFIG?.supabase?.anonKey;

if (!url || !anonKey) {
  console.error('[Supabase] Config missing: Set CONFIG.supabase.url and CONFIG.supabase.anonKey in config.js before loading this script.');
  console.error('[Supabase] Initialization stopped.');
  document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;max-width:500px;margin:2rem auto;padding:2rem;text-align:center;"><h1>Configuration error</h1><p>Your Supabase URL and API key are not set. Please edit <code>assets/js/config.js</code> and add your project credentials.</p></div>';
  return;
}

const { createClient } = supabase;
const supabaseClient = createClient(url, anonKey);

window.supabaseClient = supabaseClient;

})();
