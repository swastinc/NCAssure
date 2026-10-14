
import './App.css'
import Header from './components/Header'
import Login from './components/Login'
import AzureDevOpsUpdateNotifier from './components/AzureDevOpsUpdateNotifier'
// import { MsalProvider } from "@azure/msal-react";

function App() {
  return (

    <div className="p-6">
      <AzureDevOpsUpdateNotifier/>
      <h1 className="text-2xl font-bold">QA Portal</h1>
      <p>Welcome to the app.</p>
    </div>

  )

}

export default App
