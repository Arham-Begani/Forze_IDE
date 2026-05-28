export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem' }}>
      <h1>Forge</h1>
      <p>This Next.js host brokers OAuth secrets for the Forze desktop IDE.</p>
      <p>
        The IDE authenticates with Supabase, sends a bearer token here, and we
        forward publish requests to LinkedIn, Instagram, and YouTube on the
        founder&apos;s behalf.
      </p>
    </main>
  );
}
