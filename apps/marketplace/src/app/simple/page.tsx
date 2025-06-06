export default function SimplePage() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">🎉 LazyPrompt is Working!</h1>
      <p className="text-lg text-gray-700 mb-4">
        Congratulations! Your Next.js server is running successfully on localhost:3002
      </p>
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        <strong>Success!</strong> The application is now live and accessible.
      </div>
      <div className="mt-6">
        <h2 className="text-2xl font-semibold mb-2">Next Steps:</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>Visit the homepage at <code className="bg-gray-100 px-1 rounded">localhost:3002</code></li>
          <li>Explore the marketplace features</li>
          <li>Set up authentication and database connections</li>
        </ul>
      </div>
    </div>
  );
} 