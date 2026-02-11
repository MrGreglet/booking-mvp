// ============================================================
// EDGE FUNCTION: admin-invite-user
// Invites a new user via Supabase Admin API
// Only callable by admins (checked via admin_users table)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InviteRequest {
  email: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase URL and service role key from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    // Create Supabase client with service role (for admin operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the JWT and get user from anon client
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is an admin
    const { data: adminCheck, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { email }: InviteRequest = await req.json()

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase()

    // Get redirect URL from request or use default
    const siteUrl = Deno.env.get('SUPABASE_SITE_URL') || supabaseUrl
    const redirectTo = `${siteUrl}/auth.html`

    console.log(`Inviting user: ${normalizedEmail}, redirect: ${redirectTo}`)

    // Invite user via Admin API
    // This creates the user and sends an invite email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo,
        data: {
          first_login: true
        }
      }
    )

    if (inviteError) {
      console.error('Invite error:', inviteError)
      
      // Handle "already registered" case
      if (inviteError.message?.includes('already registered') || inviteError.message?.includes('already been registered')) {
        return new Response(
          JSON.stringify({ error: 'User already exists' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      throw inviteError
    }

    console.log('User invited successfully:', inviteData.user.id)

    // Add to allowed_users table
    const { error: allowedError } = await supabaseAdmin
      .from('allowed_users')
      .insert({
        email: normalizedEmail,
        invited_by: user.id
      })
      .select()
      .single()

    if (allowedError) {
      // If error is duplicate, ignore it (user already in allowed_users)
      if (!allowedError.message?.includes('duplicate') && !allowedError.code?.includes('23505')) {
        console.error('Failed to add to allowed_users:', allowedError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: inviteData.user.id,
          email: inviteData.user.email
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
