// Supabase Configuration
(function() {
'use strict';

const SUPABASE_URL = 'https://qkjcqtsacuspfdslgfxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFramNxdHNhY3VzcGZkc2xnZnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTM3MTEsImV4cCI6MjA4NTcyOTcxMX0.pl0ERMLuXNOivbbMipWXuEcxhBfzaWouBJplIotlqng';

// Initialize Supabase client using the library's createClient function
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabaseClient = supabaseClient;

})();
