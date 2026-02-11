# Admin Invite User - Edge Function

Server-side function to invite users via Supabase Admin API.

## Purpose

- Validates that the caller is an admin (via `admin_users` table)
- Creates/invites a user using Supabase Admin API
- Sets `first_login: true` metadata
- Adds user to `allowed_users` table
- Sends invite email with link to `auth.html`

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Deploy the function

```bash
supabase functions deploy admin-invite-user
```

### 5. Verify deployment

```bash
supabase functions list
```

## Environment Variables

The function requires these environment variables (automatically available in Supabase):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (has admin privileges)
- `SUPABASE_SITE_URL` - Your site URL (optional, for invite redirect)

## Usage

Called from frontend via `supabase.functions.invoke()`:

```javascript
const { data, error } = await supabaseClient.functions.invoke('admin-invite-user', {
  body: { email: 'user@example.com' }
});
```

## Response

**Success (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Error (400/401/403/409/500):**
```json
{
  "error": "Error message"
}
```

## Security

- ✅ Requires valid JWT in Authorization header
- ✅ Validates caller is in `admin_users` table
- ✅ Service role key never exposed to client
- ✅ All admin operations happen server-side

## Testing Locally

```bash
# Serve functions locally
supabase functions serve admin-invite-user --env-file .env.local

# Test with curl
curl -i --location --request POST 'http://localhost:54321/functions/v1/admin-invite-user' \
  --header 'Authorization: Bearer YOUR_JWT_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{"email":"test@example.com"}'
```
