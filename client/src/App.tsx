import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProtectedLayout from './components/ProtectedLayout';

// Placeholder for Dashboard Home
const DashboardHome = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold mb-4">Your Connections</h1>
    <p>List of connections will go here.</p>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardHome />} />
            {/* Add Wizard route here later */}
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
