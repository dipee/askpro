import { APP_NAME } from "@askwell/shared";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
    </main>
  );
}
