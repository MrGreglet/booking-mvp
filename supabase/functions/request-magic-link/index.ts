// ============================================================
// EDGE FUNCTION: request-magic-link
// Validates email against allowlist before sending magic link
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== Edge Function Started ===')
    
    // Parse request body
    const { email } = await req.json()
    console.log('Received email:', email)

    if (!email || typeof email !== 'string') {
      console.log('Email validation failed: missing or invalid')
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    console.log('Normalized email:', normalizedEmail)

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(normalizedEmail)) {
      console.log('Email format validation failed')
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client with SERVICE ROLE key (server-side only!)
    // All SUPABASE_* variables are automatically provided by Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    console.log('Supabase URL:', supabaseUrl)
    console.log('Service key exists:', !!supabaseServiceKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    })
    
    console.log('Supabase client created successfully')

    // Check if email is in the allowlist
    console.log('Checking allowlist for:', normalizedEmail)
    const { data: allowedUser, error: checkError } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', normalizedEmail)
      .single()

    console.log('Allowlist check result:', { data: allowedUser, error: checkError })

    if (checkError || !allowedUser) {
      // Return generic error - don't reveal if email is/isn't invited
      console.log(`Magic link request denied for: ${normalizedEmail}, Error:`, checkError)
      return new Response(
        JSON.stringify({ 
          error: 'If your email is registered, you will receive a login link shortly.' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    console.log('Email is in allowlist!')

    // Email is invited - send magic link
    const redirectTo = Deno.env.get('REDIRECT_URL') || `${new URL(req.url).origin}/`
    console.log('Preparing to send magic link')
    console.log('Email:', normalizedEmail)
    console.log('Redirect URL:', redirectTo)

    const { data: otpData, error: magicLinkError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
      }
    })

    console.log('Magic link API response:', { data: otpData, error: magicLinkError })

    if (magicLinkError) {
      console.error('Error sending magic link:', magicLinkError)
      return new Response(
        JSON.stringify({ error: 'Failed to send login link', details: magicLinkError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Success
    console.log(`✓ Magic link sent successfully to: ${normalizedEmail}`)
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Check your email for the login link!' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('=== Edge function CRASHED ===')
    console.error('Error:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
