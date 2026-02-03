# Studio94 Booking System

A modern, responsive booking calendar system built with vanilla JavaScript and Supabase, featuring a glassmorphism dark theme and real-time data synchronization across all devices.

## Features

### User Features
- **Week Calendar View**: Browse available time slots by week
- **30-Minute Slots**: Book sessions starting on the hour or half-hour
- **Real-time Availability**: See booked, pending, and available slots
- **User Authentication**: Secure login with email and PIN
- **Booking Management**: View and manage your bookings
- **Buffer Time**: Automatic 30-minute buffer between sessions

### Admin Features
- **Admin Dashboard**: Manage users, bookings, and settings
- **Week & Month Views**: Toggle between calendar views
- **Booking Approval**: Approve, decline, or cancel bookings
- **User Management**: Add/edit users, manage memberships
- **Weekly Limits**: Track subscribed user booking limits
- **Manual Booking**: Create bookings directly from admin calendar
- **Admin Notes**: Add internal notes to bookings

### Technical Features
- **Supabase Backend**: Cloud-based PostgreSQL database for data persistence
- **Real-time Sync**: Data syncs instantly across all devices (PC, mobile, tablet)
- **Sticky Calendar Headers**: Day/date headers stay visible while scrolling
- **Mobile Responsive**: Optimized for desktop, tablet, and mobile
- **Conflict Detection**: Prevents overlapping bookings with buffer validation
- **Past Booking Prevention**: Users cannot view or book past time slots
- **Prominent PIN Display**: Clear 4-digit PIN shown when creating users

## Project Structure

```
booking-mvp/
├── index.html                          # Public booking interface
├── admin.html                          # Admin dashboard
├── supabase-setup.sql                  # Database schema and setup
├── assets/
│   ├── css/
│   │   └── styles.css                  # Complete styling system
│   └── js/
│       ├── utils.js                    # Utility functions
│       ├── supabase-config.js          # Supabase credentials and client
│       ├── storage.js                  # Data layer (Supabase backend)
│       ├── storage-old.js              # Backup: Original LocalStorage version
│       ├── app.js                      # Public booking logic
│       └── admin.js                    # Admin panel logic
└── README.md
```

## Getting Started

### Prerequisites

This application requires a Supabase account for data storage.

### 1. Set Up Supabase Backend

1. **Create Supabase Account**: Sign up at [supabase.com](https://supabase.com)
2. **Create New Project**: 
   - Choose a project name
   - Set a database password (save this!)
   - Select your region
3. **Run Database Setup**:
   - Open SQL Editor in Supabase
   - Copy and paste contents of `supabase-setup.sql`
   - Click "Run" to create tables and policies
4. **Get Your Credentials**:
   - Go to Settings → API
   - Copy your **Project URL**
   - Copy your **anon/public key**
5. **Update Configuration**:
   - Open `assets/js/supabase-config.js`
   - Replace `SUPABASE_URL` with your Project URL
   - Replace `SUPABASE_ANON_KEY` with your anon key

### 2. Access the Application

**Live Site (GitHub Pages):**
- **Public Site**: https://mrgreglet.github.io/booking-mvp/
- **Admin Site**: https://mrgreglet.github.io/booking-mvp/admin.html

**Local Development:**
- Open `index.html` in a web browser (user interface)
- Open `admin.html` in a web browser (admin dashboard)

### 3. Default Admin Password

```
studio94
```

### 4. Demo Data (Development)

To enable demo data seeding:
1. Open `assets/js/admin.js`
2. Change `const DEV_MODE = false;` to `const DEV_MODE = true;`
3. The "Seed Demo Data" button will appear in the admin bookings panel

## Usage

### For Users

1. **Log In**: Enter your email and PIN (provided by admin)
2. **Browse Calendar**: Use week navigation to find available slots
   - ⚠️ **Past dates are disabled** - users can only book future slots
3. **Book a Slot**: Click an available slot
4. **Select Duration**: Choose 1-8 hours from dropdown
5. **Submit**: Your booking request will be pending until admin approval
6. **View Bookings**: Click "My Bookings" to see all your bookings
7. **Cancel Booking**: Cancel pending or approved bookings with confirmation

**Note**: Data syncs across all your devices automatically!

### For Administrators

1. **Log In**: Use the admin password (`studio94`)

2. **Manage Users**: 
   - **Add New User**: Creates user and displays **4-digit PIN prominently**
   - **Edit User**: Update name, membership, contract details
   - **Delete User**: Confirmation required (deletes user and all bookings)
   - **Reset PIN**: Generates new 4-digit PIN for user login

3. **Manage Bookings**:
   - Toggle between **week** and **month** calendar views
   - Click slots to **create manual bookings** (with conflict validation)
   - **Approve/Decline** pending bookings (with conflict checks)
   - **Cancel** approved bookings
   - **Edit** booking duration (1-8 hours dropdown)
   - **Delete** bookings (with confirmation slide-out)
   - View **admin notes** and **user notes**

4. **Settings**:
   - Configure business hours (open/close times)
   - Set buffer time between bookings
   - Adjust slot intervals

**Admin Features**:
- ✅ Can view and edit past bookings
- ✅ All actions validated for conflicts
- ✅ Data syncs across all admin devices
- ✅ Confirmation dialogs for destructive actions

## Business Rules

- **Slot Interval**: 30 minutes (bookings can start on :00 or :30)
- **Buffer Time**: 30 minutes (prevents back-to-back bookings)
- **Subscribed Users**: Limited to 1 approved booking per week
- **Standard Users**: No weekly limit
- **Conflict Detection**: Automatically prevents overlapping bookings
- **Declined/Cancelled**: Do not block time slots

## Design System

### Color Palette
- **Primary Accent**: Warm gold (`#ffb447`)
- **Background**: Dark blue-gray (`#1a1d21`)
- **Glass Surfaces**: Semi-transparent with backdrop blur
- **Success**: Green (`#4caf50`)
- **Pending**: Amber (`#e6b800`)
- **Danger**: Red (`#c94a4a`)

### Typography
- **Font**: Inter, Segoe UI, system-ui
- **Weights**: 500 (regular), 600 (semi-bold), 700 (bold)

## Mobile Support

The application is fully responsive with optimized breakpoints:

- **Desktop** (>900px): Full layout with maximum calendar height
- **Tablet** (700-900px): Compact layout with adjusted spacing
- **Mobile** (500-700px): Touch-friendly with stacked elements
- **Small Mobile** (<500px): Maximum space utilization

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Modern mobile browsers

## Backend & Database

### Supabase Integration

This application uses **Supabase** as its backend:

- **Database**: PostgreSQL (cloud-hosted)
- **Tables**: `users`, `bookings`, `settings`
- **Real-time Sync**: Data syncs automatically across all devices
- **Security**: Row Level Security (RLS) policies enabled

### Database Schema

See `supabase-setup.sql` for complete schema including:
- User authentication with PIN hash
- Booking records with status tracking
- System settings configuration
- Automatic timestamp management
- Foreign key constraints and cascading deletes

### Configuration

**File**: `assets/js/supabase-config.js`

Contains:
- Supabase Project URL
- Anonymous/Public API Key
- Client initialization

**⚠️ Security Note**: The anon key is safe to expose publicly - it's restricted by Row Level Security policies.

## Security Notes

Current security setup:
- ✅ Supabase backend with PostgreSQL database
- ✅ Row Level Security (RLS) enabled
- ✅ PIN authentication with hash storage
- ✅ Admin password protection
- ✅ HTTPS via GitHub Pages

For enhanced production security:
- Consider implementing Supabase Auth for user sessions
- Add rate limiting on API calls
- Implement admin user authentication with Supabase
- Use environment variables for configuration
- Add audit logging for admin actions

## License

MIT License - feel free to use this project as you wish.

## Author

Studio94 Booking System - Built with vanilla JavaScript
