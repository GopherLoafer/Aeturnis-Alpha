import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Code, 
  Settings, 
  Play, 
  Book, 
  FolderTree, 
  Terminal, 
  Server, 
  Bolt, 
  PlusCircle, 
  Route, 
  TestTubeDiagonal, 
  FileText, 
  Drill, 
  Rocket,
  CheckCircle,
  Circle,
  Check,
  RotateCcw,
  Folder,
  File
} from "lucide-react";

export default function Home() {
  const [serverStatus] = useState("running");
  const [environmentReady] = useState(true);

  const projectStructure = [
    { type: "folder", name: "src/", indent: 1 },
    { type: "folder", name: "components/", indent: 2 },
    { type: "folder", name: "pages/", indent: 2 },
    { type: "folder", name: "utils/", indent: 2 },
    { type: "file", name: "index.js", indent: 2, description: "Hello World entry point" },
    { type: "folder", name: "public/", indent: 1 },
    { type: "folder", name: "config/", indent: 1 },
    { type: "folder", name: "tests/", indent: 1 },
    { type: "file", name: "package.json", indent: 1 },
    { type: "file", name: "README.md", indent: 1 },
    { type: "file", name: ".gitignore", indent: 1 },
  ];

  const quickActions = [
    { icon: PlusCircle, title: "Create Component", description: "Add a new component", color: "text-blue-500" },
    { icon: Route, title: "Add Route", description: "Configure new endpoint", color: "text-green-500" },
    { icon: TestTubeDiagonal, title: "Run Tests", description: "Execute test suite", color: "text-purple-500" },
    { icon: FileText, title: "View Logs", description: "Check application logs", color: "text-orange-500" },
  ];

  const devTools = [
    { label: "Package Manager", value: "npm" },
    { label: "Node Version", value: "18.x" },
    { label: "Framework", value: "React" },
    { label: "Build Tool", value: "Vite" },
  ];

  const nextSteps = [
    {
      title: "1. Configure Environment",
      description: "Set up your development preferences and environment variables."
    },
    {
      title: "2. Add Dependencies", 
      description: "Install the libraries and frameworks you need for your project."
    },
    {
      title: "3. Start Building",
      description: "Begin developing your application with the clean foundation."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Code className="text-primary text-xl" />
                <h1 className="text-xl font-semibold text-slate-800">DevEnv</h1>
              </div>
              <span className="text-sm text-slate-500">Blank Slate Development Environment</span>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                <Circle className="h-2 w-2 fill-green-400 text-green-400 mr-1" />
                Ready
              </Badge>
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold text-slate-800 mb-2">Welcome to Your Development Environment</h2>
              <p className="text-slate-600 mb-4">Your clean slate development environment is ready. Start building your next great application with this organized foundation.</p>
              <div className="flex items-center space-x-4">
                <Button className="bg-primary hover:bg-blue-700">
                  <Play className="h-4 w-4 mr-2" />
                  Start Development
                </Button>
                <Button variant="outline">
                  <Book className="h-4 w-4 mr-2" />
                  View Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project Structure */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <FolderTree className="h-5 w-5 text-primary" />
                  <span>Project Structure</span>
                </CardTitle>
                <p className="text-sm text-slate-600">Clean, organized directory structure ready for development</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex items-center space-x-2 text-slate-700">
                    <Folder className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">project-root/</span>
                  </div>
                  {projectStructure.map((item, index) => (
                    <div 
                      key={index} 
                      className="flex items-center space-x-2 text-slate-600"
                      style={{ marginLeft: `${item.indent * 16}px` }}
                    >
                      {item.type === "folder" ? (
                        <Folder className="h-4 w-4 text-blue-400" />
                      ) : (
                        <File className="h-4 w-4 text-green-500" />
                      )}
                      <span>{item.name}</span>
                      {item.description && (
                        <span className="text-xs text-slate-400">• {item.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Hello World Demo */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Terminal className="h-5 w-5 text-primary" />
                  <span>Hello World Demo</span>
                </CardTitle>
                <p className="text-sm text-slate-600">Verify your environment is working correctly</p>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-900 rounded-md p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-400 text-sm ml-2">Terminal</span>
                  </div>
                  <div className="font-mono text-sm space-y-1">
                    <div className="text-green-400">$ npm start</div>
                    <div className="text-slate-300">Development server running on port 3000</div>
                    <div className="text-blue-400">✓ Hello World application ready</div>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
                  <div className="text-center py-8">
                    <h4 className="text-xl font-semibold text-slate-800 mb-2">Hello World! 👋</h4>
                    <p className="text-slate-600">Your development environment is running successfully.</p>
                    <div className="mt-4 inline-flex items-center space-x-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>Environment Ready</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Environment Status */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5 text-primary" />
                  <span>Environment Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Development Server</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <Circle className="h-2 w-2 fill-green-500 text-green-500 mr-1" />
                    Running
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Error Handling</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Logging System</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <Check className="h-3 w-3 mr-1" />
                    Enabled
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Hot Reload</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Bolt className="h-5 w-5 text-primary" />
                  <span>Quick Actions</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickActions.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="w-full justify-start p-3 h-auto"
                  >
                    <action.icon className={`h-4 w-4 mr-3 ${action.color}`} />
                    <div className="text-left">
                      <div className="font-medium text-slate-800">{action.title}</div>
                      <div className="text-sm text-slate-500">{action.description}</div>
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Development Drill */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Drill className="h-5 w-5 text-primary" />
                  <span>Development Drill</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {devTools.map((tool, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{tool.label}</span>
                    <span className="text-sm font-medium text-slate-800">{tool.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Next Steps */}
        <div className="mt-8">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center space-x-2">
              <Rocket className="h-5 w-5 text-primary" />
              <span>Next Steps</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nextSteps.map((step, index) => (
                <div key={index} className="bg-white rounded-md p-4 border border-blue-100">
                  <h4 className="font-medium text-slate-800 mb-2">{step.title}</h4>
                  <p className="text-sm text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
