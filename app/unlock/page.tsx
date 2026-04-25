import UnlockForm from "./UnlockForm";

type Props = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function UnlockPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const nextPath = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">App locked</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Enter the app password to continue.
        </p>

        <UnlockForm nextPath={nextPath} />
      </div>
    </div>
  );
}
