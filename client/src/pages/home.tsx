export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Development Environment
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          Ready to build something amazing
        </p>
        <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
          <div className="w-8 h-8 bg-green-500 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}