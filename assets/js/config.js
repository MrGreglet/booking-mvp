// ============================================================
// CONFIG.JS - Application configuration
// Edit these values for your deployment.
// ============================================================

(function() {
'use strict';

window.CONFIG = window.CONFIG || {
  branding: {
    appName: 'Studio94',
    appNameAdmin: 'Studio94 Admin',
    supportEmail: 'support@example.com'
  },
  supabase: {
    url: 'https://qkjcqtsacuspfdslgfxj.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFramNxdHNhY3VzcGZkc2xnZnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTM3MTEsImV4cCI6MjA4NTcyOTcxMX0.pl0ERMLuXNOivbbMipWXuEcxhBfzaWouBJplIotlqng'
  },
  timezone: 'Europe/London',
  defaults: {
    openTime: '06:00',
    closeTime: '24:00',
    bufferMinutes: 30,
    slotIntervalMinutes: 60
  },
  features: {
    debugTelemetry: false
  }
};

})();
