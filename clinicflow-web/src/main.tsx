import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom' 
//browser router allows react to read and chnage url
import { AuthProvider } from "./context/AuthContext.tsx";
import { PatientAuthProvider } from "./context/PatientAuthContext.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";


createRoot(
  document.getElementById("root")!,
).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PatientAuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </PatientAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
