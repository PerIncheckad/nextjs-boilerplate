import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Incheckad',
  description: 'Startsida',
};

const MABI_LOGO_URL = "/mabi-logo.png";

// Hardcoded whitelist for now (can be moved to Supabase later)
const REPORT_WHITELIST = [
  'per.andersson@mabi.se',
  'ingemar.carqueija@mabi.se',
  // Add more emails here as needed
];

// Helper to check if user is allowed to see the report
function canShowReport(userEmail: string): boolean {
  return REPORT_WHITELIST.includes(userEmail?.toLowerCase());
}

// This would come from session/auth in a real app
// For demo: replace with actual user email from auth context
const userEmail = typeof window !== "undefined"
  ? window.localStorage.getItem("user_email") || ""
  : "";

export default function HomePage() {
  // For demo: you would use context/provider to get the real email
  const showReport = canShowReport(userEmail);

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-xl w-full text-center space-y-6">

        <img src={MABI_LOGO_URL} alt="MABI Logo" style={{ width: 90, margin: "0 auto 24px auto" }} />

        <h1 className="text-3xl font-semibold">Välkommen</h1>
        <p className="opacity-80">
          Använd knappen nedan för att göra en ny incheckning.
        </p>
        <a
          href="/check"
          className="inline-block rounded-md border px-4 py-2"
        >
          Ny incheckning
        </a>
        <a
          href="/check/drafts"
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '8px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            textDecoration: 'none',
            color: '#222'
          }}
        >
          Fortsätt påbörjad incheckning
        </a>
        <hr style={{ margin: "40px auto", borderColor: "#e5e7eb" }} />
        {showReport && (
          <a
            href="/rapport"
            style={{
              display: 'inline-block',
              marginTop: 12,
              padding: '12px 20px',
              background: "#2563eb",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: 18,
              letterSpacing: 1
            }}
          >
            Rapport
          </a>
        )}
      </div>
    </main>
  );
}
