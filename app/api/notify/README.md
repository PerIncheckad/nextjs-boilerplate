# Email Notification API

This directory contains the email notification API endpoint that sends emails when a vehicle check-in is completed.

## File Structure

- **`route.ts`** - Main API endpoint handler
  - Receives check-in data from the frontend
  - Persists data to the database (checkins, damages, checkin_damages)
  - Sends notification emails to relevant recipients
  
- **`emailBuilders.ts`** - Email HTML construction
  - `buildHuvudstationEmail()` - Builds detailed email for main station recipients
  - `buildBilkontrollEmail()` - Builds focused email for vehicle control team
  
- **`emailHelpers.ts`** - Shared email utility functions
  - `formatCheckerName()` - Formats the checker's name consistently
  - `createAlertBanner()` - Creates warning banners for issues
  - `createAdminBanner()` - Creates info banners
  - `formatDamagesToHtml()` - Formats damage lists as HTML
  - `formatTankning()` - Formats fuel information
  - `buildBilagorSection()` - Builds attachments section
  - `createBaseLayout()` - Creates the base HTML email template
  
- **`normalizeDamageType.ts`** - Damage type normalization logic

## API Flow

1. **Receive Request** - POST request with check-in data
2. **Database Persistence** - Save data to Supabase (happens first)
   - Always create a `checkins` record
   - Only create `damages` and `checkin_damages` records if damages exist
3. **Email Generation** - Build HTML emails using builders and helpers
4. **Email Sending** - Send emails via Resend to configured recipients

## Key Features

- **Dark Mode Support** - Emails use `color-scheme: light only` to prevent auto-inversion
- **Public Media Links** - All media links point to `/public-media/` for unauthenticated access
- **Conditional Banners** - Warning and info banners appear based on vehicle conditions
- **Separation of Concerns** - Helpers, builders, and route logic are separated for maintainability

## Environment Variables

- `RESEND_API_KEY` - API key for Resend email service
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key for admin operations
- `NEXT_PUBLIC_SITE_URL` - Base URL for media links (optional, auto-detected if not set)

## Recipients

- **Huvudstation** - Main station email (per@incheckad.se) + location-specific emails
- **Bilkontroll** - Vehicle control team (per@incheckad.se, latif@incheckad.se)
