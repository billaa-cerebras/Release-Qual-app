import BatchReleaseForm from "@/components/batch-release-form";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
      <div className="w-full max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="font-headline text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Batch Model Release
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Add models to the queue and trigger their release qualifications in a single batch.
          </p>
        </div>
        <BatchReleaseForm />
      </div>
    </main>
  );
}
