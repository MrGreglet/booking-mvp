# Studio94 Booking System

A modern, responsive booking calendar system built with vanilla JavaScript, featuring a glassmorphism dark theme.

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
- **Sticky Calendar Headers**: Day/date headers stay visible while scrolling
- **Mobile Responsive**: Optimized for desktop, tablet, and mobile
- **LocalStorage**: Client-side data persistence
- **Conflict Detection**: Prevents overlapping bookings with buffer validation
- **No Dependencies**: Pure vanilla JavaScript, HTML, and CSS

## Project Structure

```
booking-mvp/
├── index.html              # Public booking interface
├── admin.html              # Admin dashboard
├── assets/
│   ├── css/
│   │   └── styles.css      # Complete styling system
│   └── js/
│       ├── utils.js        # Utility functions
│       ├── storage.js      # Data layer (localStorage)
│       ├── app.js          # Public booking logic
│       └── admin.js        # Admin panel logic
└── README.md
```

## Getting Started

### 1. Open the Application

Simply open the HTML files in a modern web browser:

- **Public Site**: Open `index.html`
- **Admin Site**: Open `admin.html`

### 2. Default Admin Password

```
studio94
```

### 3. Demo Data (Development)

To enable demo data seeding:
1. Open `assets/js/admin.js`
2. Change `const DEV_MODE = false;` to `const DEV_MODE = true;`
3. The "Seed Demo Data" button will appear in the admin bookings panel

## Usage

### For Users

1. **Log In**: Enter your email and PIN (case-sensitive)
2. **Browse Calendar**: Use week navigation to find available slots
3. **Book a Slot**: Click an available (white) slot
4. **Select Duration**: Choose 1-3 hours
5. **Submit**: Your booking request will be pending until admin approval

### For Administrators

1. **Log In**: Use the admin password
2. **Manage Users**: 
   - Add new users with membership type (subscribed/standard)
   - Edit user details
   - Reset user PINs
3. **Manage Bookings**:
   - Toggle between week/month calendar views
   - Click slots to create manual bookings
   - Approve/decline pending bookings
   - Cancel approved bookings
   - Edit booking duration
4. **Settings**:
   - Configure business hours
   - Set buffer time between bookings
   - Adjust slot intervals

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

## Security Notes

⚠️ **This is a demo/MVP application using client-side storage.**

For production use, you should:
- Implement server-side authentication
- Use a proper database
- Add HTTPS/SSL
- Implement rate limiting
- Add CSRF protection
- Use environment variables for sensitive data

## License

MIT License - feel free to use this project as you wish.

## Author

Studio94 Booking System - Built with vanilla JavaScript
