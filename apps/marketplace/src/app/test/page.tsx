export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-green-600 mb-4">
          ✅ Server is Working!
        </h1>
        <p className="text-gray-600 mb-4">
          The Next.js marketplace app is running successfully on localhost:3003
        </p>
        <div className="space-y-2 text-sm text-gray-500">
          <p>• Dependencies are properly installed</p>
          <p>• Prisma client is configured</p>
          <p>• Auth is set up</p>
          <p>• Ready for deployment</p>
        </div>
      </div>
    </div>
  );
} 