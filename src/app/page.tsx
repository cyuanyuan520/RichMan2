import { validateContent } from "@/data/content";
import { AppShell } from "@/ui/AppShell";

if (process.env.NODE_ENV !== "production") {
  validateContent();
}

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <AppShell />
    </main>
  );
}
